import {loadCdi} from '../../lib/cdi-server';
export async function GET(request:Request){return Response.json(await loadCdi(new URL(request.url).searchParams.get('retry')==='1'),{headers:{'Cache-Control':'private, no-store'}});}
