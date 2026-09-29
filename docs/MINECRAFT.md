# PocketJellyfin — Minecraft Java Edition + PaperMC Module 🎮

A native, lightweight Minecraft Java server module for **PocketJellyfin**, enabling your Android phone to host persistent multiplayer worlds alongside your 24/7 media center.

---

## 🏛️ Architecture

```
Android (Host OS)
 └── Termux
      ├── termux-wake-lock (keeps phone CPU active with screen off)
      ├── tmux session "minecraft" (background execution & interactive terminal console)
      ├── CLI: /data/data/com.termux/files/usr/bin/minecraft
      └── proot-distro (Debian Linux Container)
            ├── Java Runtime (OpenJDK 21 / 17 Headless)
            └── Minecraft Service
                 └── PaperMC Server Engine
                      ├── World (Imported Aternos / PaperMC World)
                      ├── Configs (server.properties, paper-global.yml)
                      └── Plugins & Scheduled Backups
```

---

## 📂 Module Directory Structure

The Minecraft service operates under a configurable root directory (chosen during installation: either your fast **Internal Storage** or your spacious **Micro-SD Card**):

```
minecraft/
├── config/                  # Server configuration
│   ├── minecraft.conf       # PocketJellyfin module settings (RAM, port, version)
│   ├── server.properties    # Core Minecraft server properties
│   ├── eula.txt             # EULA agreement
│   └── paper-global.yml     # PaperMC optimizations
├── server/                  # Server binaries
│   ├── paper.jar            # Active PaperMC server jar
│   └── paper-version.json   # Installed version, build number, and SHA256 checksum
├── world/                   # Active Minecraft Overworld
│   ├── level.dat            # Core world seed, time, weather, gamerules
│   ├── region/              # Chunk region files (*.mca - all builds and terrain)
│   ├── entities/            # Mob, vehicle, and item frame data
│   ├── poi/                 # Points of interest (villagers, portals, beds)
│   ├── playerdata/          # Player inventories, health, XP, and coordinates
│   ├── stats/               # Player statistics
│   ├── advancements/        # Player achievements
│   └── data/                # Maps, scoreboards, raids, and structures
├── world_nether/            # Nether dimension (PaperMC layout)
├── world_the_end/           # The End dimension (PaperMC layout)
├── plugins/                 # Server plugins (.jar files and plugin data folders)
├── backups/                 # Compressed timestamped backups (.tar.gz)
├── logs/                    # Live and historical logs (latest.log)
└── runtime/                 # Process PID, lockfiles, and run.sh launcher
```

---

## ⚡ Quick Installation

Run this single command on your phone (in Termux) or from your laptop via SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/setup_minecraft.sh | bash
```

**What it does:**
1. Detects available internal storage and micro-SD card storage, reporting free space.
2. Automatically determines the required Java version (Java 21 for 1.20.5+, Java 17 for 1.18–1.20.4) and installs it inside PRoot Debian.
3. Queries the official **PaperMC v3 API** (`fill.papermc.io/v3`) for the latest stable build of your chosen Minecraft version.
4. Downloads the official PaperMC server jar with SHA256 verification.
5. Configures mobile-optimized server settings (Aikar's G1GC flags, reduced simulation distance for smooth ARM performance).
6. Installs the `minecraft` command into your path.

---

## 🚀 Service Management Commands

The service runs inside a managed background `tmux` session. You do not need to keep Termux visibly open on your phone screen.

| Command | Action |
| :--- | :--- |
| `minecraft start` | Starts PaperMC in the background with wake-lock |
| `minecraft stop` | Gracefully flushes chunks, saves player data, and stops server |
| `minecraft restart` | Restarts the server cleanly |
| `minecraft status` | Displays live status, port, IP, RAM, world size, and storage |
| `minecraft console` | **Attaches to the live interactive server console** |
| `minecraft backup [name]` | Creates an instantaneous compressed backup of world and configs |
| `minecraft restore [file]`| Safely restores world and settings from a backup |
| `minecraft world import <path>` | **Validates and imports your Aternos/Paper world** |
| `minecraft world list` | Shows active world details and chunk statistics |
| `minecraft plugins import <path>` | Imports plugins and plugin configuration folders |
| `minecraft logs [-f]` | Views or follows live server output logs |
| `minecraft update [ver]` | Updates PaperMC to the newest official build |
| `minecraft config [key] [val]` | Adjusts RAM allocation, port, or bind address |

> [!TIP]
> When inside the live console (`minecraft console`), press **`Ctrl + B`**, then release and press **`D`** to safely detach without stopping the server.

---

## 🌍 Migrating an Existing World from Aternos

To migrate your existing PaperMC world from Aternos without losing builds, inventories, or progress:

### Understanding the Data Separation:
* **WORLD DATA** (`world/`, `region/`, `playerdata/`, etc.): Contains all terrain, player inventories, builds, chests, redstone, and advancements.
* **SERVER CONFIGURATION** (`server.properties`): Contains port, difficulty, whitelist, and server view distance.
* **PLUGIN DATA** (`plugins/`): Contains plugin jars and individual plugin database/YAML files.

### Step 1: Download from Aternos
1. Log in to **Aternos** $\rightarrow$ Navigate to **Worlds**.
2. Click **Download** for:
   - `world` (Overworld)
   - `world_nether` (if separate)
   - `world_the_end` (if separate)
3. If you have custom plugins, go to **Files** $\rightarrow$ download your `plugins` folder.

### Step 2: Transfer to your Phone
You can copy the downloaded folder or `.zip` file to your phone using any of these methods:
* **Via Windows Network Drive (`Z:\`)**: Drag and drop the `.zip` or folder into `Media/` or root of your SD card.
* **Via SSH / SCP**: 
  ```bash
  scp -P 8022 world.zip u0_a161@192.168.31.178:/storage/26B2-1AEB/
  ```

### Step 3: Run the Migration Command
In Termux (or via SSH), execute:

```bash
minecraft world import /storage/26B2-1AEB/world.zip
```
*(Or specify the extracted directory path)*.

**The migration engine automatically:**
1. Validates that `level.dat` and chunk data exist. If the folder is invalid or corrupted, **it refuses to proceed and does not touch your server**.
2. Stops Minecraft if it is currently running.
3. Creates a pre-migration backup in `backups/` so you can always roll back.
4. Copies all overworld, nether, end, player inventory files, scoreboards, and statistics with exact timestamp preservation.
5. Prompts you to start the server immediately to verify load.

---

## 🎮 Connecting to Your Server

1. Open **Minecraft Java Edition** on your PC.
2. Click **Multiplayer** $\rightarrow$ **Add Server**.
3. Server Address:
   ```text
   192.168.31.178:25565
   ```
   *(Or your phone's Tailscale IP if playing from outside your home Wi-Fi!)*
4. Click **Done** and join your world!
