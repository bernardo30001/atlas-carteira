export type Theme='light'|'dark';
export const THEME_KEY='atlas-theme';
export const resolveTheme=(saved:string|null,systemDark:boolean):Theme=>saved==='dark'||saved==='light'?saved:systemDark?'dark':'light';
export const THEME_BOOT_SCRIPT=`(()=>{let saved=null;try{saved=localStorage.getItem('atlas-theme')}catch{}const dark=typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches;const theme=saved==='dark'||saved==='light'?saved:dark?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme})()`;
