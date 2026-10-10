// Streaming multipart/form-data parser, zero dependencies.
// Never buffers a whole file in memory — part bodies stream straight to disk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function parseMultipart(req, { maxFileBytes, maxFiles, tmpDir }) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    if (!m || !ct.startsWith('multipart/form-data')) {
      return reject(Object.assign(new Error('Expected multipart/form-data.'), { status: 400 }));
    }
    const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
    const delim = Buffer.concat([Buffer.from('\r\n'), boundary]);
    const fields = {};
    const files = [];
    let state = 'preamble'; // preamble | headers | body | nextpart | done
    let sawEnd = false;     // request stream ended; only then may we fail a partial
    let settled = false;
    let openCloses = 0;     // part write streams still flushing to disk
    let doneRequested = false;
    let buf = Buffer.alloc(0);
    let cur = null; // { field, filename, mime, ws, size }
    let tmpPaths = [];
    const cleanup = () => { for (const p of tmpPaths) fs.rm(p, { force: true }, () => {}); };
    const fail = (err) => {
      cleanup();
      if (cur?.ws) cur.ws.destroy();
      req.destroy();
      reject(Object.assign(err, { status: err.status || 400 }));
    };

    fs.mkdirSync(tmpDir, { recursive: true });

    // Resolve only once the terminator was seen AND every part's write
    // stream has flushed — field parts (no disk writes) close before file
    // parts (buffered bytes), so a single fence is not enough.
    const maybeFinalize = () => {
      if (!doneRequested || openCloses > 0 || settled) return;
      settled = true;
      req.destroy();
      resolve({ fields, files });
    };

    const finishFile = (cb) => {
      if (!cur) return cb();
      const c = cur; cur = null;
      openCloses++;
      c.ws.end(() => {
        if (!c.filename) {
          // Non-file field: body was collected in c.chunks.
          fields[c.field] = Buffer.concat(c.chunks || []).toString('utf8').slice(0, 4096);
          fs.rm(c.path, { force: true }, () => {});
        } else if (c.size === 0) {
          fs.rm(c.path, { force: true }, () => {});
        } else {
          files.push({ field: c.field, filename: c.filename, mime: c.mime, path: c.path, size: c.size });
        }
        openCloses--;
        cb();
        maybeFinalize();
      });
    };

    const startPart = (headerText) => {
      const nameM = headerText.match(/name="([^"]*)"/i);
      const fileM = headerText.match(/filename="([^"]*)"/i);
      const mimeM = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
      const field = nameM ? nameM[1] : 'file';
      const filename = fileM ? fileM[1].split(/[\\/]/).pop() : null;
      const dest = path.join(tmpDir, crypto.randomBytes(8).toString('hex'));
      tmpPaths.push(dest);
      cur = {
        field, filename: filename || null,
        mime: mimeM ? mimeM[1].trim() : 'application/octet-stream',
        path: dest, size: 0,
        ws: fs.createWriteStream(dest),
        chunks: filename ? null : [],
      };
    };

    const process = () => {
      while (true) {
        if (state === 'preamble' || state === 'nextpart') {
          // A part may still be closing (ws.end is async) — its completion
          // callback re-invokes process(); never race ahead of it.
          if (state === 'nextpart' && cur) return;
          const idx = buf.indexOf(boundary);
          if (idx === -1) {
            if (sawEnd && state === 'nextpart') fail(new Error('Upload ended unexpectedly.'));
            return; // wait for more data
          }
          buf = buf.subarray(idx + boundary.length);
          if (buf.length < 2) {
            if (sawEnd) fail(new Error('Upload ended unexpectedly.'));
            return;
          }
          if (buf[0] === 0x2d && buf[1] === 0x2d) { state = 'done'; break; } // "--" terminator
          if (buf[0] === 0x0d && buf[1] === 0x0a) { buf = buf.subarray(2); state = 'headers'; continue; }
          if (sawEnd) fail(new Error('Upload ended unexpectedly.'));
          return; // wait for the CRLF after boundary
        }
        if (state === 'headers') {
          const idx = buf.indexOf('\r\n\r\n');
          if (idx === -1) {
            if (sawEnd) fail(new Error('Upload ended unexpectedly.'));
            return;
          }
          startPart(buf.subarray(0, idx).toString('utf8'));
          buf = buf.subarray(idx + 4);
          state = 'body';
          continue;
        }
        if (state === 'body') {
          const idx = buf.indexOf(delim);
          if (idx === -1) {
            // Keep the last (delim.length-1) bytes in case the delimiter
            // straddles a chunk boundary; stream everything safe out now.
            const keep = delim.length - 1;
            if (buf.length > keep) {
              const out = buf.subarray(0, buf.length - keep);
              buf = buf.subarray(buf.length - keep);
              if (cur) {
                cur.size += out.length;
                if (cur.size > maxFileBytes) return fail(new Error('File exceeds the upload size limit.'));
                if (cur.chunks) cur.chunks.push(out);
                else if (!cur.ws.write(out)) return req.pause(); // backpressure
              }
            }
            return;
          }
          const out = buf.subarray(0, idx);
          buf = buf.subarray(idx); // leave delimiter for 'nextpart'
          if (cur) {
            cur.size += out.length;
            if (cur.size > maxFileBytes) return fail(new Error('File exceeds the upload size limit.'));
            if (cur.chunks) cur.chunks.push(out);
            else cur.ws.write(out);
          }
          state = 'nextpart';
          finishFile(() => process());
          return;
        }
        break; // done
      }
      // Terminator seen — resolve once all part streams have flushed.
      doneRequested = true;
      maybeFinalize();
    };

    req.on('drain', () => req.resume());
    req.on('data', (chunk) => {
      if (state === 'done') return;
      if (files.length >= maxFiles) return fail(new Error(`Too many files (max ${maxFiles}).`));
      buf = Buffer.concat([buf, chunk]);
      process();
    });
    req.on('end', () => {
      sawEnd = true;
      if (state === 'done') { doneRequested = true; maybeFinalize(); }
      else process(); // completes via the pending part-close callback, or fails
    });
    req.on('error', (err) => fail(err));
    // Safety net: never leave an upload request hanging forever.
    const killer = setTimeout(() => {
      if (!settled) fail(new Error('Upload timed out.'));
    }, 10 * 60 * 1000);
    killer.unref?.();
  });
}
