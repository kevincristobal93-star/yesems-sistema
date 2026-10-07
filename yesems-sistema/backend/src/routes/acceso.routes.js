const router = require('express').Router();
const access = require('../services/acceso.service');
const passwords = require('../services/password.service');
const auth = require('../middlewares/auth.middleware');
const wrap = (fn) => async (req,res) => {
  res.set('Cache-Control','no-store');
  try { await fn(req,res); }
  catch(error) {
    const status = error.statusCode || (error.code === '23505' ? 409 : 500);
    if (status === 500) console.error('Error de acceso:', error.code || error.name);
    res.status(status).json({ok:false,mensaje: error.statusCode ? error.message : status===409 ? 'La cuenta ya existe. Inicia sesión para continuar.' : 'No fue posible completar el acceso.'});
  }
};
router.get('/config', wrap(async(req,res)=>res.json({ok:true,...access.config()})));
router.post('/codigo', wrap(async(req,res)=>{await access.sendCode(req.body.email,req.ip);res.json({ok:true,mensaje:'Revisa tu correo. El código vence en 10 minutos.'});}));
router.post('/correo', wrap(async(req,res)=>res.json(await access.byEmail(req.body,req.ip))));
router.post('/google/reto', wrap(async(req,res)=>{await access.limit('challenge:'+access.digest(req.ip),30,900);res.json({ok:true,...access.challenge()});}));
router.post('/google', wrap(async(req,res)=>res.json(await access.byGoogle(req.body,req.ip))));
router.post('/password/crear', wrap(async(req,res)=>res.json(await require('../services/password-setup.service').complete(req.body,req.ip))));
router.post('/password/codigo', wrap(async(req,res)=>res.json(await passwords.requestCode(req.body.email,req.ip))));
router.post('/password/restablecer', wrap(async(req,res)=>res.json(await passwords.update(req.body,req.ip))));
router.post('/password/mio/codigo', auth, wrap(async(req,res)=>res.json(await passwords.requestCode(null,req.ip,req.usuario.id_usuario))));
router.post('/password/mio', auth, wrap(async(req,res)=>res.json(await passwords.update(req.body,req.ip,req.usuario.id_usuario))));
module.exports=router;
