const C: Record<string, string> = {
  DIM:       '\x1b[38;2;100;100;100m',
  GREY:      '\x1b[38;2;150;150;160m',
  CYAN:      '\x1b[38;2;80;210;220m',
  BLUE:      '\x1b[38;2;90;140;220m',
  LBLUE:     '\x1b[38;2;120;180;255m',
  GREEN:     '\x1b[38;2;80;200;120m',
  LGREEN:    '\x1b[38;2;140;230;140m',
  MINT:      '\x1b[38;2;100;220;180m',
  YELLOW:    '\x1b[38;2;240;200;60m',
  ORANGE:    '\x1b[38;2;240;140;40m',
  GOLD:      '\x1b[38;2;255;180;0m',
  RED:       '\x1b[38;2;220;70;70m',
  PINK:      '\x1b[38;2;240;100;180m',
  MAGENTA:   '\x1b[38;2;200;80;220m',
  PURPLE:    '\x1b[38;2;160;100;240m',
  LAVENDER:  '\x1b[38;2;180;140;255m',
  WHITE:     '\x1b[38;2;220;220;230m',
  RESET:     '\x1b[0m',
  BOLD:      '\x1b[1m',
};

const TAG_COLORS: Record<string, [string, string]> = {
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

const _ports:    Array<{ name: string; port: string | number }> = [];
const _services: string[] = [];
const _logs:     string[] = [];
const _warnings: string[] = [];
let   _summaryPrinted = false;

const _origStderrWrite = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = (chunk: any, ...args: any[]) => {
  const str = chunk.toString().trim();
  if (str) _warnings.push(str);
  return true;
};

const _origConsoleLog = console.log.bind(console);
console.log = (...args: any[]) => {
  const line = args.join(' ');
  if (_summaryPrinted) {
    process.stdout.write(`${C.DIM}${line}${C.RESET}\n`);
  } else {
    _logs.push(line);
  }
};

function ts(): string {
  const n = new Date();
  const h = String(n.getHours()).padStart(2, '0');
  const m = String(n.getMinutes()).padStart(2, '0');
  const s = String(n.getSeconds()).padStart(2, '0');
  return `${C.DIM}${h}:${m}:${s}${C.RESET}`;
}

function wrapLine(line: string, maxLen: number): string[] {
  const out: string[] = [];
  while (line.length > maxLen) {
    out.push(line.slice(0, maxLen));
    line = line.slice(maxLen);
  }
  out.push(line);
  return out;
}

function box(title: string, lines: string[], borderColor: string, textColor: string = C.WHITE): string {
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

function _print(tag: string, msg: string): void {
  const [tc, mc] = TAG_COLORS[tag] || [C.GREY, C.WHITE];
  const line = `${ts()} ${C.DIM}│${C.RESET} ${tc}${C.BOLD}${tag.padEnd(10)}${C.RESET} ${mc}${msg}${C.RESET}`;
  if (_summaryPrinted) {
    process.stdout.write(line + '\n');
  } else {
    _logs.push(`${ts()} | ${tag}: ${msg}`);
  }
}

function _ingame(tag: string, msg: string): void {
  const [tc, mc] = TAG_COLORS[tag] || [C.GREY, C.WHITE];
  const line = `${ts()} ${C.DIM}│${C.RESET} ${tc}${C.BOLD}${tag.padEnd(10)}${C.RESET} ${mc}${msg}${C.RESET}`;
  if (_summaryPrinted) {
    process.stdout.write(line + '\n');
  } else {
    _logs.push(`${ts()} | ${tag}: ${msg}`);
  }
}

class Logger {
  registerPort(name: string, port: string | number): void {
    _ports.push({ name, port });
  }

  registerService(name: string): void {
    _services.push(name);
  }

  printStartupSummary(): void {
    (process.stderr as any).write = _origStderrWrite;
    console.clear();

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
      const lines = _ports.map(p => `${String(p.name).padEnd(22)} port ${p.port}`);
      process.stdout.write(box('PORTS', lines, C.BLUE, C.LBLUE) + '\n\n');
    }

    if (_services.length) {
      process.stdout.write(box('SERVICES', _services, C.GREEN, C.LGREEN) + '\n\n');
    }

    if (_logs.length) {
      process.stdout.write(box('STARTUP LOGS', _logs, C.YELLOW, C.GOLD) + '\n\n');
    }

    if (_warnings.length) {
      const seen = new Set<string>();
      const lines = _warnings
        .flatMap(w => w.split('\n'))
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('(Use `node') && !l.startsWith('at '))
        .filter(l => { if (seen.has(l)) return false; seen.add(l); return true; });
      if (lines.length) {
        process.stdout.write(box('WARNINGS & ERRORS', lines, C.RED, C.ORANGE) + '\n\n');
      }
    }

    const termWidth = (process.stdout.columns || 100) - 4;
    const w = Math.min(termWidth, 120);
    const title = 'LIVE LOGS';
    process.stdout.write(`${C.MINT}\u2554${'═'.repeat(w + 2)}\u2557${C.RESET}\n`);
    process.stdout.write(`${C.MINT}\u2551 ${C.BOLD}${title.padEnd(w)}${C.RESET}${C.MINT} \u2551${C.RESET}\n`);
    process.stdout.write(`${C.MINT}\u2560${'═'.repeat(w + 2)}\u2563${C.RESET}\n`);

    _summaryPrinted = true;
    console.log = _origConsoleLog;
  }

  discordauth(msg: string): void { _print('discordauth', msg); }
  database(msg: string): void    { _print('db',          msg); }
  backend(msg: string): void     { _print('backend',     msg); }
  presence(msg: string): void    { _print('presence',    msg); }
  bot(msg: string): void         { _print('bot',         msg); }
  party(msg: string): void       { _print('party',       msg); }
  arena(msg: string): void       { _print('arena',       msg); }
  xmpp(msg: string): void        { _print('xmpp',        msg); }
  error(msg: string): void       { _print('ERR',         msg); }
  request(msg: string): void     { _print('req',         msg); }
  panel(msg: string): void       { _print('panel',       msg); }
  launcher(msg: string): void    { _print('launcher',    msg); }
  debug(msg: string): void       { _print('debug',       msg); }
  warn(msg: string): void        { _print('WARN',        msg); }
  info(msg: string): void        { _print('info',        msg); }
  api(msg: string): void         { _print('api',         msg); }
  backendstart(msg: string): void{ _print('start',       msg); }

  vbucks(msg: string): void   { _ingame('vbucks',   msg); }
  hype(msg: string): void     { _ingame('hype',     msg); }
  xp(msg: string): void       { _ingame('xp',       msg); }
  kill(msg: string): void     { _ingame('KILL',     msg); }
  died(msg: string): void     { _ingame('DIED',     msg); }
  win(msg: string): void      { _ingame('WIN',      msg); }
  umbrella(msg: string): void { _ingame('umbrella', msg); }
  crown(msg: string): void    { _ingame('crown',    msg); }
  notjoinable(msg: string): void { _ingame('notjoin', msg); }
}

export default new Logger();
