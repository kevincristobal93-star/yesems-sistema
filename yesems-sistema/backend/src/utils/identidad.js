function normalizarCurp(value) {
  const curp = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{18}$/.test(curp)) throw Object.assign(new Error('La CURP debe contener 18 letras y números.'), {statusCode:400});
  // Valida formato básico, no certifica identidad ante RENAPO.
  return curp;
}
module.exports = {normalizarCurp};
