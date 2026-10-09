import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Shedify · Nursing rosters',description:'Hospital nursing staff scheduling and roster management'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
