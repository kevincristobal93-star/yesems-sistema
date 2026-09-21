jest.mock('../src/models/administrador.model', () => ({
  obtenerAdminPorId: jest.fn(),
  contarAdministradoresActivos: jest.fn(),
  desactivarAdmin: jest.fn(),
}));

const adminModel = require('../src/models/administrador.model');
const { desactivarAdmin } = require('../src/controllers/administrador.controller');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function request(id, adminId = 1) {
  return { params: { id }, admin: { id_administrador: adminId } };
}

describe('desactivarAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rechaza un ID inválido antes de consultar el modelo', async () => {
    const res = response();
    await desactivarAdmin(request('abc'), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'ID inválido' });
    expect(adminModel.obtenerAdminPorId).not.toHaveBeenCalled();
  });

  test('impide que un administrador se desactive a sí mismo', async () => {
    const res = response();
    await desactivarAdmin(request('3', 3), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, mensaje: 'No puedes desactivar tu propia cuenta' });
    expect(adminModel.obtenerAdminPorId).not.toHaveBeenCalled();
  });

  test('impide desactivar la última cuenta administrativa activa', async () => {
    const res = response();
    adminModel.obtenerAdminPorId.mockResolvedValue({ id_administrador: 2, activo: true });
    adminModel.contarAdministradoresActivos.mockResolvedValue(1);
    await desactivarAdmin(request('2', 1), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, mensaje: 'No se puede desactivar la última cuenta de administrador activa' });
    expect(adminModel.desactivarAdmin).not.toHaveBeenCalled();
  });

  test('desactiva una cuenta distinta cuando hay dos o más administradores', async () => {
    const res = response();
    const adminDesactivado = { id_administrador: 2, activo: false };
    adminModel.obtenerAdminPorId.mockResolvedValue({ id_administrador: 2, activo: true });
    adminModel.contarAdministradoresActivos.mockResolvedValue(2);
    adminModel.desactivarAdmin.mockResolvedValue(adminDesactivado);
    await desactivarAdmin(request('2', 1), res);
    expect(adminModel.desactivarAdmin).toHaveBeenCalledWith(2);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true, mensaje: 'Administrador desactivado', administrador: adminDesactivado });
  });

  test('devuelve 404 si la cuenta administrativa no existe', async () => {
    const res = response();
    adminModel.obtenerAdminPorId.mockResolvedValue(undefined);
    await desactivarAdmin(request('99', 1), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ ok: false, mensaje: 'Administrador no encontrado' });
  });
});
