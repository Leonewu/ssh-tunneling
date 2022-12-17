const logger = {
  success(...t: any[]) {
    console.log(`\x1b[32m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  purple(...t: any[]) {
    console.log(`\x1b[35m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  cyan(...t: any[]) {
    console.log(`\x1b[36m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  error(...t: any[]) {
    console.log(`\x1b[31m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  info(...t: any[]) {
    console.log(...t);
  },
  warn(...t: any[]) {
    console.log(`\x1b[33m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  lightWhite(...t: any[]) {
    console.log(`\x1b[2m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  bgBlack(...t: any[]) {
    console.log(`\x1b[40m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
  bgRed(...t: any[]) {
    console.log(`\x1b[101m${'%s'.repeat(t?.length)}\x1b[0m`, ...t);
  },
};

export default logger;