@echo off
cd /d "%~dp0"
echo Generating HTTPS certificate for Peppy Radio...
if not exist certs mkdir certs
"C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout certs\key.pem -out certs\cert.pem -subj "/CN=peppy-radio" -addext "subjectAltName=IP:192.168.31.48,IP:192.168.10.1,IP:127.0.0.1,DNS:localhost"
echo Certificate created in certs\ folder.
pause
