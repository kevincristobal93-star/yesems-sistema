jest.mock('../src/config/db',()=>({query:jest.fn()}));
const pool=require('../src/config/db');
const users=require('../src/models/usuario.model');
const {normalizarCurp}=require('../src/utils/identidad');
const access=require('../src/services/acceso.service');
describe('Normalización de identidad',()=>{
  test('correo se normaliza sin alterar puntos ni alias de otros proveedores',()=>{
    expect(access.email(' Nombre+alias@Ejemplo.com ')).toBe('nombre+alias@ejemplo.com');
    expect(()=>access.email({})).toThrow();expect(()=>access.email('sin arroba')).toThrow();
    expect(()=>access.email('password:alumno@example.test')).toThrow();
  });
  test('nueva contraseña requiere longitud mínima y no se trunca en bcrypt',()=>{
    const {validatePassword}=require('../src/services/password.service');
    expect(()=>validatePassword('corta')).toThrow();expect(()=>validatePassword('ñ'.repeat(37))).toThrow();
    expect(()=>validatePassword('Una frase de prueba larga')).not.toThrow();
  });
  test('CURP acepta espacios exteriores y minúsculas, rechaza formato incompleto',()=>{
    expect(normalizarCurp(' test000101hdfxxx00 ')).toBe('TEST000101HDFXXX00');
    expect(()=>normalizarCurp('corta')).toThrow();expect(()=>normalizarCurp({})).toThrow();
  });
  test('nombres iguales son válidos y teléfono se normaliza como contacto',()=>{
    expect(access.profile({nombre:' Ana ',apellido:' Cruz ',telefono:'+52 (55) 0000-0000'})).toEqual({nombre:'Ana',apellido:'Cruz',telefono:'+525500000000'});
    expect(()=>access.profile({nombre:'Ana',apellido:'Cruz',telefono:'abc'})).toThrow();
  });
  test('login no selecciona una cuenta cuando hay duplicados históricos',async()=>{
    pool.query.mockResolvedValueOnce({rows:[{id_usuario:1},{id_usuario:2}]});
    expect(await users.obtenerUsuarioPorEmail(' SAME@EXAMPLE.TEST ')).toBeUndefined();
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining('lower(btrim(email))'),['same@example.test']);
  });
});
