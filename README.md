# tools-V1

cat > README.md << 'EOF'
# WhatsApp Bot Base

## Cara Install di Termux

```bash
1. pkg update && pkg upgrade

2. pkg install git

3. pkg install nodejs

3. git clone https://github.com/zdeCodeR/tools-V1.git

4. cd tools-V1

5. cat > package.json << 'EOF'
   {
    "name": "my-whatsapp-bot",
    "version": "1.0.0",
    "main": "index.js",
    "scripts": {
    "start": "node index.js"
     },
    "dependencies": {
    "@whiskeysockets/baileys": "^6.5.0",
    "pino": "^9.0.0"
  }
}
EOF

6. npm install
7. npm start