/*
  https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit
  格式：\033[显示方式;前景色;背景色m
  前景色表示方式为：38;颜色模式;颜色数值
  背景色表示方式为：48;颜色模式;颜色数值
  \x1b[0m 结束设置
  如 256 模式的前景色：38;5;226;
  如 256 模式的背景色：48;5;201;
    

    说明：
    前景色            背景色           颜色
    ---------------------------------------
    30                40              黑色
    31                41              红色
    32                42              绿色
    33                43              黃色
    34                44              蓝色
    35                45              紫红色
    36                46              青蓝色
    37                47              白色
    
    显示方式           意义
    -------------------------
    0                终端默认设置
    1                高亮/加粗显示
    4                使用下划线
    5                闪烁
    7                反白显示
    8                不可见
    
    例子：
    \033[0;31;40m    <!--1-高亮显示 31-前景色红色  40-背景色黑色-->
    \033[0m          <!--采用终端默认设置，即取消颜色设置-->
    前景色 + 背景色：console.log('\033[0;38;5;69;48;5;177m123\\x1b[0m');
    前景色：console.log('\033[0;38;5;69m123\\x1b[0m');
    背景色：console.log('\033[0;48;5;177m123\\x1b[0m');
    前景色：for (let i = 1 ;i<255;i++) {console.log(`\x1b[0;38;5;${i}m${i}\x1b[0m`)}
    背景色：for (let i = 1 ;i<255;i++) {console.log(`\x1b[0;48;5;${i}m${i}\x1b[0m`)}
    前景色 + 背景色：for (let i = 1 ;i<255;i++) {console.log(`\x1b[0;38;5;${i};48;5;${i}m${i}\x1b[0m`)}
*/

import { padRight } from "./utils";

function colorOutput(options: { fontColor?: number; bgColor?: number; newLine?: boolean, content: any }) {
  const { fontColor, bgColor, newLine = true, content } = options;
  const str = newLine ? content : typeof content === 'object' ? JSON.stringify(content) : String(content);
  const colorSet = (fontColor && bgColor) ? `\x1b[0;38;5;${fontColor};48;5;${bgColor}m` : fontColor ? `\x1b[0;38;5;${fontColor}m` : `\x1b[0;48;5;${bgColor}m`;
  const end = '\x1b[0m';
  if (newLine) {
    console.log(`${colorSet}%s${end}`, str);
    return;
  }
  process.stdout.write(`${colorSet}${str}${end}`);
}


type Color = 'success' | 'error' | 'info' | 'warn' | 'white' | 'bgWhite' | 'cyan' | 'bgCyan' | 'black' |
  'bgBlack' | 'red' | 'bgRed' | 'purple' | 'bgPurple' | 'blue' | 'bgBlue' | 'pink' | 'bgPink' | 
   'green' | 'bgGreen' | 'yellow' | 'bgYellow' | 'orange' | 'bgOrange' | 'gray' | 'bgGray' | 'mint' | 'bgMint';


const config: Record<Color, [number, number]>  = {
  success: [46, 0],
  error: [196, 0],     
  info: [15, 0],
  warn: [184, 0],      
  white: [15, 0],
  bgWhite: [0, 15],    
  cyan: [123, 0],
  bgCyan: [0, 123],    
  black: [232, 0],
  bgBlack: [255, 232], 
  red: [160, 0],
  bgRed: [255, 160],   
  purple: [57, 0],
  bgPurple: [255, 56], 
  blue: [39, 0],
  bgBlue: [255, 20],   
  pink: [198, 0],
  bgPink: [0, 198],    
  green: [46, 0],
  bgGreen: [0, 46],    
  yellow: [226, 0],
  bgYellow: [0, 226],  
  orange: [202, 0],
  bgOrange: [0, 202],  
  gray: [232, 0],
  bgGray: [0, 232],
  mint: [48, 0],
  bgMint: [0, 48],
}


type Logger = Record<Color, (content: any, options?: { newLine?: boolean }) => void> & {
  /** log one line */
  line: (logs: {
    type?: Color,
    content: any,
  }[]) => void;

  lineGradient: (content: string) => void;

  // lineGradient: (content: string[]) => void;

}


const logger: Logger = {
  ...Object.entries(config).reduce((pre, [type, config]) => {
    const [fontColor, bgColor] = config;
    pre[type] = (content, options) => {
      colorOutput({
        fontColor: fontColor || undefined,
        bgColor: bgColor || undefined,
        ...options,
        content
      });
    }
    return pre;
  }, {} as Omit<Logger, 'line' | 'lineGradient'>),

  line(logs) {
    logs.forEach((log, i) => {
      logger[log.type || 'info'](log.content, { newLine: i === logs.length - 1 });
    });
  },

  lineGradient(content: string) {
    const lines = content.split('\n');
    // const colors = [
    //   40, 41, 42, 43, 44, 45,
    //   81, 117, 153, 189, 225
    // ]
    // const colors1 = [
    //   51, 87, 123, 159, 195, 231,
    //   230, 229, 228, 227, 226
    // ]
    // const colors2 = [
    //   45, 81, 117, 153, 189, 225,
    //   224, 223, 222, 221, 220
    // ]
    // const c = [
    //   51, 87, 123, 159, 195, 231,
    //   230, 194,158, 122, 86, 50
    // ]
    const generateColors = (start: number) => {
      // start 为右上角的色值，按照顺时针
      // 上下相差 36，左右相差 1
      const right = new Array(6).fill(0).map((_, i) => start + (36 * i));
      const bottom = new Array(5).fill(0).map((_, i) => right[right.length - 1] - i - 1);
      const left = new Array(5).fill(0).map((_, i) =>  bottom[bottom.length - 1] - (36 * (i + 1)));
      const top = new Array(5).fill(0).map((_, i) =>  left[left.length - 1] + i + 1);
      // 色卡中有5个方块
      const trbl = [
        ...top,
        ...right,
        ...bottom,
        ...left,
      ];
      const rblt = [
        ...right,
        ...bottom,
        ...left,
        ...top
      ]
      const bltr = [
        ...bottom,
        ...left,
        ...top,
        ...right,
      ]
      const ltrb = [
        ...left,
        ...top,
        ...right,
        ...bottom,
      ] 
      return trbl;
    }
    const colors = generateColors(51);
    lines.forEach((str, i) => {
      colorOutput({
        content: str,
        fontColor: colors[i]
      });
    })
  }
  
};


// logger.line(Object.keys(config).map((type: any) => ({ type, content: type })));

// logger.lineGradient(
//   `
//    ▄▄▄▄███▄▄▄▄      ▄████████    ▄██████▄   ▄█   ▄████████
//   ▄██▀▀▀███▀▀▀██▄   ███    ███   ███    ███ ███  ███    ███
//   ███   ███   ███   ███    ███   ███    █▀  ███▌ ███    █▀
//   ███   ███   ███   ███    ███  ▄███        ███▌ ███
//   ███   ███   ███ ▀███████████ ▀▀███ ████▄  ███▌ ███
//   ███   ███   ███   ███    ███   ███    ███ ███  ███    █▄
//   ███   ███   ███   ███    ███   ███    ███ ███  ███    ███
//    ▀█   ███   █▀    ███    █▀    ████████▀  █▀   ████████▀
  
//    `);
// logger.lineGradient(`
// ███╗   ███╗ █████╗  ██████╗ ██╗ ██████╗██╗
// ████╗ ████║██╔══██╗██╔════╝ ██║██╔════╝██║
// ██╔████╔██║███████║██║  ███╗██║██║     ██║
// ██║╚██╔╝██║██╔══██║██║   ██║██║██║     ╚═╝
// ██║ ╚═╝ ██║██║  ██║╚██████╔╝██║╚██████╗██╗
// ╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝ ╚═════╝╚═╝
//                                           `);

export default logger;



