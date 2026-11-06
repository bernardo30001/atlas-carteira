import {loadFundamentals} from '../../lib/fundamentals-server';
export async function GET(){
 try{const data=await loadFundamentals();return Response.json(data,{status:Object.keys(data.items).length?200:503,headers:{'Cache-Control':'private, max-age=60'}});}catch{return Response.json({items:{},peers:{},errors:['Não foi possível consultar os fundamentos.'],fetchedAt:new Date().toISOString()},{status:503});}
}
