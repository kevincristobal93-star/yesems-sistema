jest.mock('../src/models/usuario.model',()=>({obtenerUsuarioPorId:jest.fn()}));
const jwt=require('jsonwebtoken');
const users=require('../src/models/usuario.model');
const auth=require('../src/middlewares/auth.middleware');
describe('Revocación de sesiones después de cambiar contraseña',()=>{
  const priorSecret=process.env.JWT_SECRET;
  beforeAll(()=>{process.env.JWT_SECRET='clave-ficticia-exclusiva-de-esta-prueba';});
  afterAll(()=>{if(priorSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=priorSecret;});
  async function check(claims,version){
    users.obtenerUsuarioPorId.mockResolvedValue({id_usuario:1,activo:true,rol:'alumno',token_version:version});
    const req={headers:{authorization:'Bearer '+jwt.sign({id_usuario:1,...claims},process.env.JWT_SECRET)}};
    const res={status:jest.fn().mockReturnThis(),json:jest.fn()};const next=jest.fn();
    await auth(req,res,next);return {res,next};
  }
  test('token anterior sin versión sigue válido antes del primer cambio',async()=>{expect((await check({},0)).next).toHaveBeenCalled();});
  test('token anterior deja de funcionar al cambiar la versión',async()=>{const result=await check({},1);expect(result.res.status).toHaveBeenCalledWith(401);expect(result.next).not.toHaveBeenCalled();});
  test('token nuevo con la versión actual permite el acceso',async()=>{expect((await check({token_version:1},1)).next).toHaveBeenCalled();});
  test('permiso de crear contraseña no se acepta como sesión aunque su firma sea válida',async()=>{const result=await check({purpose:'password_setup',aud:'yesems-password-setup'},0);expect(result.res.status).toHaveBeenCalledWith(401);expect(result.next).not.toHaveBeenCalled();});
});
