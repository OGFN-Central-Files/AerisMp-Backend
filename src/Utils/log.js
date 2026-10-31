const C = {
  // greys
  DIM:       '\x1b[38;2;100;100;100m',
  GREY:      '\x1b[38;2;150;150;160m',
  // blues
  CYAN:      '\x1b[38;2;80;210;220m',
  BLUE:      '\x1b[38;2;90;140;220m',
  LBLUE:     '\x1b[38;2;120;180;255m',
  // greens
  GREEN:     '\x1b[38;2;80;200;120m',
  LGREEN:    '\x1b[38;2;140;230;140m',
  MINT:      '\x1b[38;2;100;220;180m',
  // yellows / oranges
  YELLOW:    '\x1b[38;2;240;200;60m',
  ORANGE:    '\x1b[38;2;240;140;40m',
  GOLD:      '\x1b[38;2;255;180;0m',
  // reds / pinks
  RED:       '\x1b[38;2;220;70;70m',
  PINK:      '\x1b[38;2;240;100;180m',
  MAGENTA:   '\x1b[38;2;200;80;220m',
  // purples
  PURPLE:    '\x1b[38;2;160;100;240m',
  LAVENDER:  '\x1b[38;2;180;140;255m',
  // whites
  WHITE:     '\x1b[38;2;220;220;230m',
  RESET:     '\x1b[0m',
  BOLD:      '\x1b[1m',
};

// tag → [label color, message color]
const TAG_COLORS = {
  'db':          [C.MINT,     C.LGREEN],
  'backend':     [C.LBLUE,    C.BLUE],
  'bot':         [C.MAGENTA,  C.LAVENDER],
  'xmpp':        [C.PURPLE,   C.LAVENDER],
  'req':         [C.GREY,     C.DIM],
  'info':        [C.CYAN,     C.WHITE],
  'debug':       [C.DIM,      C.DIM],
  'WARN':        [C.ORANGE,   C.YELLOW],
  'ERR':         [C.RED,      C.RED],
  'api':         [C.GOLD,     C.YELLOW],
  'arena':       [C.ORANGE,   C.GOLD],
  'start':       [C.LGREEN,   C.GREEN],
  'discordauth': [C.PINK,     C.LAVENDER],
  'presence':    [C.LBLUE,    C.CYAN],
  'party':       [C.MAGENTA,  C.PINK],
  'panel':       [C.GOLD,     C.YELLOW],
  'launcher':    [C.CYAN,     C.LBLUE],
  'vbucks':      [C.GOLD,     C.YELLOW],
  'hype':        [C.ORANGE,   C.GOLD],
  'xp':          [C.LBLUE,    C.CYAN],
  'KILL':        [C.RED,      C.PINK],
  'DIED':        [C.RED,      C.GREY],
  'WIN':         [C.LGREEN,   C.GREEN],
  'umbrella':    [C.CYAN,     C.MINT],
  'crown':       [C.GOLD,     C.YELLOW],
};

const _ports    = [];
const _services = [];
const _logs     = [];
const _warnings = [];
let   _summaryPrinted = false;

const _origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  const str = chunk.toString().trim();
  if (str) _warnings.push(str);
  return true;
};

const _origConsoleLog = console.log.bind(console);
console.log = (...args) => {
  const line = args.join(' ');
  if (_summaryPrinted) {
    process.stdout.write(`${C.DIM}${line}${C.RESET}\n`);
  } else {
    _logs.push(line);
  }
};

function ts() {
  const n = new Date();
  const h = String(n.getHours()).padStart(2, '0');
  const m = String(n.getMinutes()).padStart(2, '0');
  const s = String(n.getSeconds()).padStart(2, '0');
  return `${C.DIM}${h}:${m}:${s}${C.RESET}`;
}

function wrapLine(line, maxLen) {
  const out = [];
  while (line.length > maxLen) {
    out.push(line.slice(0, maxLen));
    line = line.slice(maxLen);
  }
  out.push(line);
  return out;
}

function box(title, lines, borderColor, textColor = C.WHITE) {
  if (!lines.length) return '';
  const termWidth = (process.stdout.columns || 100) - 4;
  const maxContent = Math.min(termWidth, 120);
  const wrapped = lines.flatMap(l => wrapLine(l, maxContent));
  const width = Math.max(title.length, ...wrapped.map(l => l.length));
  const top     = `\u2554${'═'.repeat(width + 2)}\u2557`;
  const bottom  = `\u255a${'═'.repeat(width + 2)}\u255d`;
  const header  = `\u2551 ${C.BOLD}${title.padEnd(width)}${C.RESET}${borderColor} \u2551`;
  const divider = `\u2560${'═'.repeat(width + 2)}\u2563`;
  const rows    = wrapped.map(l => `\u2551 ${textColor}${l.padEnd(width)}${C.RESET}${borderColor} \u2551`);
  return [top, header, divider, ...rows, bottom]
    .map(l => `${borderColor}${l}${C.RESET}`)
    .join('\n');
}

function _print(tag, msg) {
  const [tc, mc] = TAG_COLORS[tag] || [C.GREY, C.WHITE];
  const line = `${ts()} ${C.DIM}│${C.RESET} ${tc}${C.BOLD}${tag.padEnd(10)}${C.RESET} ${mc}${msg}${C.RESET}`;
  if (_summaryPrinted) {
    process.stdout.write(line + '\n');
  } else {
    _logs.push(`${ts()} | ${tag}: ${msg}`);
  }
}

function _ingame(tag, msg) {
  const [tc, mc] = TAG_COLORS[tag] || [C.GREY, C.WHITE];
  const line = `${ts()} ${C.DIM}│${C.RESET} ${tc}${C.BOLD}${tag.padEnd(10)}${C.RESET} ${mc}${msg}${C.RESET}`;
  if (_summaryPrinted) {
    process.stdout.write(line + '\n');
  } else {
    _logs.push(`${ts()} | ${tag}: ${msg}`);
  }
}

class Logger {
  registerPort(name, port) {
    _ports.push({ name, port });
  }

  registerService(name) {
    _services.push(name);
  }

  printStartupSummary() {
    process.stderr.write = _origStderrWrite;
    console.clear();

    // gradient-ish banner
    const bannerColors = [C.CYAN, C.LBLUE, C.BLUE, C.PURPLE, C.MAGENTA, C.PINK];
    const banner = [
      `  █████╗ ███████╗██████╗ ██╗███████╗    ██████╗  █████╗  ██████╗██╗  ██╗███████╗███╗   ██╗██████╗ `,
      ` ██╔══██╗██╔════╝██╔══██╗██║██╔════╝    ██╔══██╗██╔══██╗██╔════╝██║ ██╔╝██╔════╝████╗  ██║██╔══██╗`,
      ` ███████║█████╗  ██████╔╝██║███████╗    ██████╔╝███████║██║     █████╔╝ █████╗  ██╔██╗ ██║██║  ██║`,
      ` ██╔══██║██╔══╝  ██╔══██╗██║╚════██║    ██╔══██╗██╔══██║██║     ██╔═██╗ ██╔══╝  ██║╚██╗██║██║  ██║`,
      ` ██║  ██║███████╗██║  ██║██║███████║    ██████╔╝██║  ██║╚██████╗██║  ██╗███████╗██║ ╚████║██████╔╝`,
      ` ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚══════╝    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═════╝ `,
    ];
    process.stdout.write('\n');
    banner.forEach((l, i) => process.stdout.write(`${bannerColors[i % bannerColors.length]}${l}${C.RESET}\n`));
    process.stdout.write('\n');

    if (_ports.length) {
      const lines = _ports.map(p => `${p.name.padEnd(22)} port ${p.port}`);
      process.stdout.write(box('PORTS', lines, C.BLUE, C.LBLUE) + '\n\n');
    }

    if (_services.length) {
      process.stdout.write(box('SERVICES', _services, C.GREEN, C.LGREEN) + '\n\n');
    }

    if (_logs.length) {
      process.stdout.write(box('STARTUP LOGS', _logs, C.YELLOW, C.GOLD) + '\n\n');
    }

    if (_warnings.length) {
      const seen = new Set();
      const lines = _warnings
        .flatMap(w => w.split('\n'))
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('(Use `node') && !l.startsWith('at '))
        .filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
      if (lines.length) {
        process.stdout.write(box('WARNINGS & ERRORS', lines, C.RED, C.ORANGE) + '\n\n');
      }
    }

    // live log header
    const termWidth = (process.stdout.columns || 100) - 4;
    const w = Math.min(termWidth, 120);
    const title = 'LIVE LOGS';
    process.stdout.write(`${C.MINT}\u2554${'═'.repeat(w + 2)}\u2557${C.RESET}\n`);
    process.stdout.write(`${C.MINT}\u2551 ${C.BOLD}${title.padEnd(w)}${C.RESET}${C.MINT} \u2551${C.RESET}\n`);
    process.stdout.write(`${C.MINT}\u2560${'═'.repeat(w + 2)}\u2563${C.RESET}\n`);

    _summaryPrinted = true;
    console.log = _origConsoleLog;
  }

  discordauth(msg) { _print('discordauth', msg); }
  database(msg)    { _print('db',          msg); }
  backend(msg)     { _print('backend',     msg); }
  presence(msg)    { _print('presence',    msg); }
  bot(msg)         { _print('bot',         msg); }
  party(msg)       { _print('party',       msg); }
  arena(msg)       { _print('arena',       msg); }
  xmpp(msg)        { _print('xmpp',        msg); }
  error(msg)       { _print('ERR',         msg); }
  request(msg)     { _print('req',         msg); }
  panel(msg)       { _print('panel',       msg); }
  launcher(msg)    { _print('launcher',    msg); }
  debug(msg)       { _print('debug',       msg); }
  warn(msg)        { _print('WARN',        msg); }
  info(msg)        { _print('info',        msg); }
  api(msg)         { _print('api',         msg); }
  backendstart(msg){ _print('start',       msg); }

  vbucks(msg)   { _ingame('vbucks',   msg); }
  hype(msg)     { _ingame('hype',     msg); }
  xp(msg)       { _ingame('xp',       msg); }
  kill(msg)     { _ingame('KILL',     msg); }
  died(msg)     { _ingame('DIED',     msg); }
  win(msg)      { _ingame('WIN',      msg); }
  umbrella(msg) { _ingame('umbrella', msg); }
  crown(msg)    { _ingame('crown',    msg); }
  notjoinable(msg) { _ingame('notjoin', msg); }
}

export default new Logger();
