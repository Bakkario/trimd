import { render } from 'ink';
import App from './ui/App.js';

const USAGE = `usage: trimd <FILE> [flags]

Flags:
  --root <dir>        Root for wikilink basename resolution + sidebar start dir
                      (default: the directory containing FILE)
  --theme <id>        Theme id, built-in or user theme (default: config / 'default')
  --config <path>     Alternate config file (default: $XDG_CONFIG_HOME/trimd/config.json)
  --no-frontmatter    Hide the frontmatter metadata block
  --no-sidebar        Start with the sidebar closed
  --hidden            Show hidden (dot) entries in the sidebar
  --width <n>         Force the effective render width
  --debug             Verbose stderr + stack traces on error
  -h, --help          Print this usage and exit
`;

function parseArgs(argv: string[]): { file: string | null } {
  const file = argv.find((a) => !a.startsWith('-')) ?? null;
  return { file };
}

const args = parseArgs(process.argv.slice(2));
const wantHelp = process.argv.slice(2).includes('-h') || process.argv.slice(2).includes('--help');

if (wantHelp || args.file === null) {
  console.log(USAGE);
  process.exit(0);
}

render(<App />);
