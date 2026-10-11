# Peppy Radio

A private radio station for your home network.

- Plays your music on a shuffled loop, 24/7, as one shared live stream
- You can go on air with your voice from your phone or laptop; the music dips while you talk
- Optional "station break" clips (voice notes, jingles, messages) play between songs
- Stays on your Wi-Fi only. No tunnels, no accounts, nothing public. The DJ booth needs a PIN.

## Set it up (Termux, once)

1. Get the folder into Termux. If you downloaded `peppy-radio.zip` to your phone:
   ```
   termux-setup-storage
   pkg install -y unzip
   cp ~/storage/downloads/peppy-radio.zip ~ && unzip peppy-radio.zip
   cd peppy-radio
   ```
2. Run setup (installs Node, makes the HTTPS certificate):
   ```
   bash setup.sh
   ```
3. Add songs to `music/`. Not MP3? Convert a whole folder:
   ```
   ./convert.sh ~/storage/shared/Music
   ```
   You can also point `musicDir` in `config.json` at a folder on your SD card (any folder of MP3s works).
4. Start it:
   ```
   ./start.sh
   ```
   It prints the addresses. Your DJ PIN is in `config.json`.

It won't clash with Jellyfin (8096) or Minecraft (25565); the radio uses port **8443** (change `port` in `config.json`).

## Use it

| Who | Open (on the same Wi-Fi) |
| --- | --- |
| Listeners | `https://<phone-ip>:8443/` then press **Tune in** |
| You, the DJ | `https://<phone-ip>:8443/dj`, enter the PIN, press **Go on air** |

The first visit shows a certificate warning (the certificate is your own). Choose **Advanced, then Proceed**. This is what lets the browser allow your microphone.

## Keep it running 24/7

- `./start.sh` holds a wake-lock and restarts the server if it crashes.
- To leave it running after you close Termux: `nohup ./start.sh > radio.log 2>&1 &`
- In Android settings, set Termux to **Battery: unrestricted** so the phone doesn't put it to sleep.
- Start on boot (optional): install the **Termux:Boot** app from F-Droid, then create `~/.termux/boot/peppy-radio.sh` containing:
  ```
  #!/data/data/com.termux/files/usr/bin/bash
  cd ~/peppy-radio && nohup ./start.sh > radio.log 2>&1 &
  ```

## Settings (`config.json`)

| Key | What it does |
| --- | --- |
| `stationName` | Name shown on the pages |
| `port` | Port to listen on (default 8443) |
| `musicDir` | Folder of MP3s (default `music`) |
| `jingleDir` | Folder of short clips played between songs (default `jingles`) |
| `jingleEvery` | Play a clip after every N songs (0 turns it off) |
| `djPin` | PIN for the DJ booth. Change it any time, then restart |

## Tips

- Name files `Artist - Song.mp3`; the filename is what listeners see as the title.
- Drop a voice note or message (as MP3) into `jingles/` and it will be played in between songs.
- Don't tune in on the same device you broadcast from, or you'll hear an echo.
- Voice goes out live; the first listener may need a couple of seconds to start hearing the music after pressing Tune in.
- If your phone's IP changes, just use the new address. The certificate warning will appear once again.
