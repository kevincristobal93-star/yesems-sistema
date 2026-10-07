const mail=require('../src/services/mail.service');
describe('Correo transaccional por Gmail API (sin red)',()=>{
  const originalEnv=process.env;const originalFetch=global.fetch;
  const message={to:'alumno@example.test',subject:'Cambio de contraseña de YES EMS',text:'Código ficticio 123456. Vence en 10 minutos.'};
  beforeEach(()=>{
    jest.spyOn(console,'error').mockImplementation(()=>{});
    process.env={...originalEnv,EMAIL_PROVIDER:'gmail',GMAIL_CLIENT_ID:'test-id',GMAIL_CLIENT_SECRET:'test-secret',GMAIL_REFRESH_TOKEN:'test-refresh',GMAIL_SENDER_EMAIL:'yesems@example.test'};
    global.fetch=jest.fn(async url=>{
      if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'test-access'})};
      if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send')return {ok:true,json:async()=>({id:'test-message'})};
      throw new Error('Red no permitida');
    });
  });
  afterEach(()=>{process.env=originalEnv;global.fetch=originalFetch;jest.restoreAllMocks();});
  test('renueva autorización privada y envía MIME UTF-8 sin contraseñas ni tokens en el correo',async()=>{
    expect(mail.configured()).toBe(true);await mail.send(message);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const refresh=new URLSearchParams(global.fetch.mock.calls[0][1].body);
    expect(refresh.get('grant_type')).toBe('refresh_token');
    const options=global.fetch.mock.calls[1][1];
    expect(options.headers.Authorization).toBe('Bearer test-access');
    const raw=JSON.parse(options.body).raw;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const mime=Buffer.from(raw,'base64url').toString();
    expect(mime).toContain('From: YES EMS <yesems@example.test>');
    expect(mime).toContain('To: alumno@example.test');
    expect(Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString()).toBe(message.text);
    expect(mime).not.toMatch(/test-secret|test-refresh|test-access/);
  });
  test.each(['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER_EMAIL'])('sin %s no habilita ni intenta envío',async key=>{
    delete process.env[key];expect(mail.configured()).toBe(false);
    await expect(mail.send(message)).rejects.toThrow('No se pudo enviar');expect(global.fetch).not.toHaveBeenCalled();
  });
  test('proveedor desconocido no activa correo',()=>{process.env.EMAIL_PROVIDER='invalid';expect(mail.configured()).toBe(false);});
  test.each([
    {...message,to:'a@example.test\r\nBcc: x@example.test'},
    {...message,subject:'Aviso\r\nBcc: x@example.test'},
  ])('rechaza inyección de cabeceras',async input=>{
    await expect(mail.send(input)).rejects.toThrow('No se pudo enviar');expect(global.fetch).not.toHaveBeenCalled();
  });
  test('rechaza remitente con cabeceras adicionales',()=>{process.env.GMAIL_SENDER_EMAIL='a@example.test\r\nBcc:x@example.test';expect(mail.configured()).toBe(false);});
  test('token revocado no envía ni filtra respuesta',async()=>{
    global.fetch.mockResolvedValueOnce({ok:false,json:async()=>({error:'invalid_grant',secret:'test-secret'})});
    await expect(mail.send(message)).rejects.toThrow(/^No se pudo enviar el correo\.$/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('cuota o error Gmail no reintenta ni cambia a Resend',async()=>{
    global.fetch.mockResolvedValueOnce({ok:true,json:async()=>({access_token:'test-access'})}).mockResolvedValueOnce({ok:false,status:429});
    await expect(mail.send(message)).rejects.toThrow('No se pudo enviar');expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  test('fallo de red se transforma en error sin datos privados',async()=>{
    global.fetch.mockRejectedValueOnce(new Error('test-secret test-refresh'));
    await expect(mail.send(message)).rejects.toThrow(/^No se pudo enviar el correo\.$/);
  });
  test('una respuesta sin ID de mensaje no cuenta como envío confirmado',async()=>{
    global.fetch.mockResolvedValueOnce({ok:true,json:async()=>({access_token:'test-access'})}).mockResolvedValueOnce({ok:true,json:async()=>({})});
    await expect(mail.send(message)).rejects.toThrow('No se pudo enviar');
  });
  test('Resend sigue disponible explícitamente, sin llamar a Google',async()=>{
    process.env.EMAIL_PROVIDER='resend';process.env.RESEND_API_KEY='test-resend';process.env.AUTH_EMAIL_FROM='test@example.test';
    global.fetch.mockResolvedValueOnce({ok:true});await mail.send(message);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.resend.com/emails');expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('diagnóstico OAuth conserva solo etapa, estado, código permitido y referencia',async()=>{
    global.fetch.mockResolvedValueOnce({ok:false,status:400,json:async()=>({error:'invalid_grant',error_description:'test-secret test-refresh alumno@example.test 123456'})});
    let failure;try {await mail.send(message);} catch(error){failure=error;}
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0][0]).toBe('[mail-diagnostic]');
    const diagnostic=JSON.parse(console.error.mock.calls[0][1]);
    expect(diagnostic).toEqual({event:'mail_delivery_failed',reference:failure.mailReference,provider:'gmail',stage:'oauth_refresh',status:400,code:'invalid_grant'});
    expect(failure.mailReference).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(console.error.mock.calls)).not.toMatch(/test-secret|test-refresh|alumno@example.test|123456|error_description/);
  });
  test('diagnóstico Gmail distingue permisos sin registrar mensaje o token',async()=>{
    global.fetch.mockResolvedValueOnce({ok:true,status:200,json:async()=>({access_token:'test-access'})})
      .mockResolvedValueOnce({ok:false,status:403,json:async()=>({error:{message:'test-access '+message.text,errors:[{reason:'insufficientPermissions'}]}})});
    await expect(mail.send(message)).rejects.toThrow('No se pudo enviar');
    expect(JSON.parse(console.error.mock.calls[0][1])).toMatchObject({stage:'gmail_send',status:403,code:'insufficientPermissions'});
    expect(JSON.stringify(console.error.mock.calls)).not.toMatch(/test-access|123456|alumno@example.test/);
  });
  test('errores desconocidos o cuerpos no JSON no se copian a los logs',async()=>{
    for(const response of [
      {ok:false,status:401,json:async()=>({error:'test-secret',error_description:message.text})},
      {ok:false,status:502,json:async()=>{throw new Error('test-refresh');}},
    ]) {
      global.fetch.mockResolvedValueOnce(response);
      await expect(mail.send(message)).rejects.toThrow('No se pudo enviar');
    }
    expect(console.error.mock.calls.every(call=>JSON.parse(call[1]).code==='provider_error')).toBe(true);
    expect(JSON.stringify(console.error.mock.calls)).not.toMatch(/test-secret|test-refresh|123456/);
  });
  test('timeout se distingue del fallo de red sin registrar el error original',async()=>{
    global.fetch.mockRejectedValueOnce(Object.assign(new Error('test-secret'),{name:'TimeoutError'}));
    await expect(mail.send(message)).rejects.toThrow('No se pudo enviar');
    expect(JSON.parse(console.error.mock.calls[0][1])).toMatchObject({stage:'oauth_refresh',code:'timeout'});
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('test-secret');
  });
  test('envíos correctos no registran contenido ni credenciales',async()=>{
    await mail.send(message);expect(console.error).not.toHaveBeenCalled();
  });
});
