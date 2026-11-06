import type { Metadata } from 'next';
import './globals.css';
import {THEME_BOOT_SCRIPT} from './lib/theme';
export const metadata:Metadata={title:'Atlas · Sua carteira, por inteiro',description:'Carteira global, aportes e notícias dos seus ativos.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:THEME_BOOT_SCRIPT}}/></head><body>{children}</body></html>}
