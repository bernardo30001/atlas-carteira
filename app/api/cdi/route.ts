import {loadCdi} from '../../lib/cdi-server';
export async function GET(){return Response.json(await loadCdi(),{headers:{'Cache-Control':'private, max-age=300'}});}
