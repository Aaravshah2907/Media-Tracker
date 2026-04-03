import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const bus = new EventEmitter();

// Paths
const DATA_DIR = path.join(process.env.HOME, 'Documents/Personal/Tracker');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

// Prefer the workspace-local .local/bin if it exists
const LOCAL_BIN = path.join(DATA_DIR, '.local/bin');
const HOME_BIN = path.join(process.env.HOME, '.local/bin');
const BIN_DIR = fs.existsSync(LOCAL_BIN) ? LOCAL_BIN : HOME_BIN;

app.use(cors());
app.use(bodyParser.json());

let activeProcess = null;

// Helper to escape shell arguments
const escapeShell = (arg) => {
    if (typeof arg !== 'string') return arg;
    if (arg === '') return "''";
    // If it only contains "safe" characters (no spaces, etc), don't quote it
    if (/^[a-zA-Z0-9_\-\.]+$/.test(arg)) {
        return arg;
    }
    return `'${arg.replace(/'/g, "'\\''")}'`;
};

// API Endpoints
app.get('/api/library', async (req, res) => {
    try {
        const data = await fs.readFile(LIBRARY_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read library' });
    }
});

app.post('/api/library', async (req, res) => {
    try {
        await fs.writeFile(LIBRARY_FILE, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update library' });
    }
});

app.get('/api/cache/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const filename = id.replace(/[:\/]/g, '_') + '.json';
        const filePath = path.join(CACHE_DIR, type, filename);
        
        if (await fs.pathExists(filePath)) {
            const data = await fs.readFile(filePath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({ error: 'Cache file not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read cache' });
    }
});

// SSE for streaming terminal output
app.get('/api/terminal/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const listener = (data) => send({ type: 'output', data });
    const errorListener = (data) => send({ type: 'error', data });
    const exitListener = (code) => send({ type: 'exit', code });

    bus.on('output', listener);
    bus.on('error', errorListener);
    bus.on('exit', exitListener);

    req.on('close', () => {
        bus.off('output', listener);
        bus.off('error', errorListener);
        bus.off('exit', exitListener);
    });
});

app.post('/api/open-vlc', (req, res) => {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    const cmd = `open -a VLC ${escapeShell(filePath)}`;
    console.log(`Executing: ${cmd}`);
    spawn(cmd, { shell: '/bin/bash' });
    res.json({ success: true });
});

app.post('/api/open-mt-add', (req, res) => {
    const script = `
        tell application "iTerm"
            activate
            if not (exists window 1) then
                create window with default profile
            else
                tell current window
                    create tab with default profile
                end tell
            end if
            tell current window
                tell current session
                    write text "~/.local/bin/mt-add " without newline
                end tell
            end tell
        end tell
    `;
    spawn('osascript', ['-e', script]);
    res.json({ success: true });
});


app.post('/api/sync', (req, res) => {
    if (activeProcess) {
        return res.status(400).json({ error: 'Sync is already running' });
    }

    let finalPath = path.join(BIN_DIR, 'mt-info');
    
    if (!fs.existsSync(finalPath)) {
        finalPath = path.join(HOME_BIN, 'mt-info');
    }

    if (!fs.existsSync(finalPath)) {
        return res.status(404).json({ error: `mt-info script not found` });
    }

    console.log(`Executing sync: ${finalPath}`);
    
    const env = { 
        ...process.env, 
        DATA_DIR, 
        PATH: `${BIN_DIR}:${HOME_BIN}:${process.env.PATH}`, 
        TERM: 'xterm-256color',
        GUI: 'true'
    };

    activeProcess = spawn(finalPath, [], { env });

    let stdoutBuffer = '';
    activeProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();
        lines.forEach(line => bus.emit('output', line));
    });

    let stderrBuffer = '';
    activeProcess.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop();
        lines.forEach(line => bus.emit('error', line));
    });

    activeProcess.on('close', (code) => {
        if (stdoutBuffer) bus.emit('output', stdoutBuffer);
        if (stderrBuffer) bus.emit('error', stderrBuffer);
        
        bus.emit('exit', code);
        activeProcess = null;
    });

    res.json({ success: true });
});

app.post('/api/terminal/input', (req, res) => {
    if (!activeProcess) {
        return res.status(400).json({ error: 'No active process' });
    }
    const { input } = req.body;
    activeProcess.stdin.write(input + '\n');
    res.json({ success: true });
});

app.post('/api/terminal/kill', (req, res) => {
    if (activeProcess) {
        activeProcess.kill('SIGTERM');
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'No active process' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Library linked to: ${LIBRARY_FILE}`);
    console.log(`Using scripts from: ${BIN_DIR}`);
});
