from typing import List
from datetime import date
from decimal import Decimal
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

import models
import schemas
from database import SessionLocal, engine

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from security import verify_password, create_access_token, SECRET_KEY, ALGORITHM, get_password_hash

# Configuración del esquema OAuth2 (Apunta al endpoint de login)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Nos aseguramos de que las tablas existan
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="API de Importaciones y Pagos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción lo cambiaremos al dominio real
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Función vital: Abre y cierra la conexión a la base de datos para cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credenciales_exception = HTTPException(
        status_code=401,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decodificamos el token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credenciales_exception
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="El token ha expirado", headers={"WWW-Authenticate": "Bearer"})
    except InvalidTokenError:
        raise credenciales_exception
        
    # Buscamos al usuario en la BD
    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if user is None:
        raise credenciales_exception
        
    # Verificamos que el usuario siga activo
    if not user.is_active:
        raise HTTPException(status_code=401, detail="El usuario inactivo o suspendido")
        
    return user

# --- CONTROL DE ROLES (RBAC) ---
class RoleChecker:
    def __init__(self, roles_permitidos: List[int]):
        self.roles_permitidos = roles_permitidos

    def __call__(self, current_user: models.Usuario = Depends(get_current_user)):
        if current_user.id_rol not in self.roles_permitidos:
            raise HTTPException(
                status_code=403,
                detail="Operación denegada: No tienes los permisos necesarios para realizar esta acción."
            )
        return current_user

# --- BITÁCORA DE AUDITORÍA ---
async def registrar_auditoria(db: Session, id_usuario: int, endpoint: str, accion: str, detalles: str, ip_address: str):
    nuevo_log = models.AuditLog(
        id_usuario=id_usuario,
        endpoint=endpoint,
        accion=accion,
        detalles=detalles,
        ip_address=ip_address
    )
    db.add(nuevo_log)
    db.commit()


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Buscar al usuario por username
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    
    # 2. Verificar existencia y contraseña
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Username o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # 3. Verificar si está activo
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario inactivo")
        
    # 4. Crear Payload y generar Access Token
    # Insertamos datos extra (como el id_rol) por si los necesitamos extraer fácilmente sin tocar la BD
    access_token = create_access_token(
        data={"sub": user.username, "id_rol": user.id_rol, "id_usuario": user.id_usuario}
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

# --- PATRÓN STRATEGY PARA VALIDACIÓN DE DAMS ---

def validar_dam_definitiva(dam: schemas.DetalleDamCreate):
    dam.monto_valor_provisional_usd = None
    return dam

def validar_dam_provisional(dam: schemas.DetalleDamCreate):
    if not dam.monto_valor_provisional_usd or dam.monto_valor_provisional_usd <= Decimal('0'):
        raise HTTPException(
            status_code=400, 
            detail="Operación rechazada. Como el Maestro es 'PROVISIONAL', el campo 'monto_valor_provisional_usd' es obligatorio y debe ser mayor a 0."
        )
    return dam

ESTRATEGIAS_VALIDACION_DAM = {
    "DEFINITIVO": validar_dam_definitiva,
    "PROVISIONAL": validar_dam_provisional
}

@app.get("/")
def ruta_principal():
    return {"mensaje": "¡Servidor de Importaciones funcionando al 100%!"}

# --- ENDPOINTS DE USUARIOS ---
@app.post("/usuarios/", response_model=schemas.Usuario)
def crear_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.Usuario).filter(models.Usuario.username == usuario.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="El username ya está registrado")
    hashed_password = get_password_hash(usuario.password)
    nuevo_usuario = models.Usuario(
        id_rol=usuario.id_rol,
        username=usuario.username,
        email=usuario.email,
        is_active=usuario.is_active,
        hashed_password=hashed_password
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario

# --- ENDPOINTS DE CATÁLOGOS ---
@app.post("/bancos/", response_model=schemas.CatBanco)
def crear_banco(banco: schemas.CatBancoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_banco = models.CatBanco(nombre=banco.nombre)
    db.add(nuevo_banco)
    db.commit()
    db.refresh(nuevo_banco)
    return nuevo_banco

@app.post("/agentes/", response_model=schemas.CatAgente)
def crear_agente(agente: schemas.CatAgenteCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_agente = models.CatAgente(**agente.model_dump())
    db.add(nuevo_agente)
    db.commit()
    db.refresh(nuevo_agente)
    return nuevo_agente

@app.post("/proveedores/", response_model=schemas.CatProveedor)
def crear_proveedor(proveedor: schemas.CatProveedorCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_proveedor = models.CatProveedor(**proveedor.model_dump())
    db.add(nuevo_proveedor)
    db.commit()
    db.refresh(nuevo_proveedor)
    return nuevo_proveedor

@app.post("/almacenes/", response_model=schemas.CatAlmacen)
def crear_almacen(almacen: schemas.CatAlmacenCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_almacen = models.CatAlmacen(**almacen.model_dump())
    db.add(nuevo_almacen)
    db.commit()
    db.refresh(nuevo_almacen)
    return nuevo_almacen

@app.post("/importadores/", response_model=schemas.CatImportador)
def crear_importador(importador: schemas.CatImportadorCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_importador = models.CatImportador(**importador.model_dump())
    db.add(nuevo_importador)
    db.commit()
    db.refresh(nuevo_importador)
    return nuevo_importador

@app.post("/empresas/", response_model=schemas.CatEmpresa)
def crear_empresa(empresa: schemas.CatEmpresaCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    try:
        nueva_empresa = models.CatEmpresa(**empresa.model_dump())
        db.add(nueva_empresa)
        db.commit()
        db.refresh(nueva_empresa)
        return nueva_empresa
    except IntegrityError:
        db.rollback() 
        raise HTTPException(status_code=400, detail="Error: El Nombre o RUC ya están registrados.")

# --- ENDPOINTS PARA MAESTRO_IMPORTACIONES ---
@app.post("/maestros/", response_model=schemas.MaestroImportacion)
def crear_maestro(maestro: schemas.MaestroImportacionCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_maestro = models.MaestroImportacion(**maestro.model_dump())
    
    # Automatización CFR
    fob = nuevo_maestro.fob_usd if nuevo_maestro.fob_usd is not None else Decimal('0.00')
    flete = nuevo_maestro.flete_usd if nuevo_maestro.flete_usd is not None else Decimal('0.00')
    nuevo_maestro.cfr_usd = fob + flete
    
    db.add(nuevo_maestro)
    db.commit()
    db.refresh(nuevo_maestro)
    return nuevo_maestro

@app.put("/maestros/{id_maestro}", response_model=schemas.MaestroImportacion)
def actualizar_maestro(id_maestro: int, maestro_editado: schemas.MaestroImportacionUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not db_maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
    
    update_data = maestro_editado.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_maestro, key, value)
        
    # Automatización CFR (Recálculo)
    fob = db_maestro.fob_usd if db_maestro.fob_usd is not None else Decimal('0.00')
    flete = db_maestro.flete_usd if db_maestro.flete_usd is not None else Decimal('0.00')
    db_maestro.cfr_usd = fob + flete
        
    db.commit()
    db.refresh(db_maestro)
    return db_maestro

# --- ENDPOINT DE LEVANTE (MÁQUINA DE ESTADOS) ---
@app.put("/maestros/{id_maestro}/autorizar-levante", response_model=schemas.MaestroImportacion)
async def autorizar_levante(
    id_maestro: int, 
    request: Request,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 3])) # 1: Admin, 3: Logística
):
    # 1. Buscar el maestro
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    if not maestro.dams:
        raise HTTPException(status_code=400, detail="El maestro no tiene ninguna DAM asociada para evaluar el levante.")

    # 2. Máquina de Estados: Matriz de Canales
    for dam in maestro.dams:
        if dam.canal_control == 'ROJO' and maestro.tipo_valor == 'DEFINITIVO':
            if not dam.aforo_realizado:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Operación denegada: El Canal Rojo Definitivo exige Aforo Físico antes del Levante para la DAM {dam.numero_de_dam}."
                )

    # 3. Aplicar el Levante
    maestro.estado_levante = 'CON LEVANTE'
    db.commit()
    db.refresh(maestro)

    # 4. Bitácora de Auditoría
    detalles_auditoria = f'{{"id_maestro": {id_maestro}, "nuevo_estado": "CON LEVANTE"}}'
    
    await registrar_auditoria(
        db=db,
        id_usuario=current_user.id_usuario,
        endpoint=request.url.path,
        accion="AUTORIZACION LEVANTE",
        detalles=detalles_auditoria,
        ip_address=request.client.host if request.client else "IP Desconocida"
    )

    return maestro

# --- ENDPOINTS PARA DAMS ---
@app.post("/dams/", response_model=schemas.DetalleDam)
def crear_dam(dam: schemas.DetalleDamCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == dam.id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="El Maestro de Importación asociado no existe en la base de datos.")

    estrategia = ESTRATEGIAS_VALIDACION_DAM.get(maestro.tipo_valor)
    if estrategia:
        dam = estrategia(dam)

    nueva_dam = models.DetalleDam(**dam.model_dump())
    db.add(nueva_dam)
    db.commit()
    db.refresh(nueva_dam)
    return nueva_dam

@app.put("/dams/{id_dam}", response_model=schemas.DetalleDam)
def actualizar_dam(id_dam: int, dam_editada: schemas.DetalleDamUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == id_dam).first()
    
    if not db_dam:
        raise HTTPException(status_code=404, detail="DAM no encontrada")
        
    update_data = dam_editada.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_dam, key, value)
        
    db.commit()
    db.refresh(db_dam)
    return db_dam

# --- ENDPOINTS PARA GASTOS ---
@app.post("/gastos/", response_model=schemas.RegistroGasto)
async def crear_gasto(
    request: Request,
    gasto: schemas.RegistroGastoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 3])) # 1: Admin, 3: Logística
):
    # 1. Consultar información del Proveedor
    proveedor = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == gasto.id_proveedor).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="El proveedor especificado no existe.")

    # 2. Normalización Estricta del Número de Documento
    if proveedor.categoria != "ESTADO_O_TRIBUTO" and gasto.numero_documento and "-" in gasto.numero_documento:
        partes = gasto.numero_documento.split("-", 1)
        if len(partes) == 2:
            serie = partes[0]
            correlativo = partes[1].zfill(8) # Rellena con ceros a la izquierda hasta 8 dígitos
            gasto.numero_documento = f"{serie}-{correlativo}"

    # 3. Candado Lógico Anti-Duplicados Documentales
    if gasto.numero_documento:
        gasto_duplicado = db.query(models.RegistroGasto).filter(
            models.RegistroGasto.id_proveedor == gasto.id_proveedor,
            models.RegistroGasto.id_tipo_doc == gasto.id_tipo_doc,
            models.RegistroGasto.numero_documento == gasto.numero_documento,
            models.RegistroGasto.estado_registro == "ACTIVO"
        ).first()
        
        if gasto_duplicado:
            raise HTTPException(
                status_code=400, 
                detail=f"Duplicidad detectada: Ya existe un gasto registrado con el documento {gasto.numero_documento} para este proveedor."
            )

    # 4. Guardar en Base de Datos
    try:
        nuevo_gasto = models.RegistroGasto(**gasto.model_dump())
        db.add(nuevo_gasto)
        db.commit()
        db.refresh(nuevo_gasto)
        
        # --- AUDITORÍA: Registro de Creación ---
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion="CREACION GASTO",
            detalles=gasto.model_dump_json(), # Pydantic V2 convierte el payload a string JSON
            ip_address=request.client.host if request.client else "IP Desconocida"
        )
        
        return nuevo_gasto
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al crear gasto: {str(e)}")
@app.put("/gastos/{id_gasto}", response_model=schemas.RegistroGasto)
def actualizar_gasto(id_gasto: int, gasto_editado: schemas.RegistroGastoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto).first()
    if not db_gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
        
    # Candado de Auditoría Financiera
    if db_gasto.estado_pago == "PAGADO":
        raise HTTPException(
            status_code=403, 
            detail="Acción rechazada por Auditoría: No se permite modificar un gasto que ya ha sido PAGADO."
        )
        
    update_data = gasto_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_gasto, key, value)
        
    db.commit()
    db.refresh(db_gasto)
    return db_gasto

# --- ENDPOINTS PARA PAGOS ---
@app.post("/pagos/", response_model=schemas.RegistroPago)
async def registrar_pago(
    request: Request,
    pago: schemas.RegistroPagoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 2])) # 1: Admin, 2: Tesorería
):
    if pago.id_gasto is None:
        raise HTTPException(status_code=400, detail="Debe proporcionar un id_gasto válido.")

    # 1. Búsqueda y Bloqueo de Pagados
    gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == pago.id_gasto).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="El gasto asociado no existe.")
    
    if gasto.estado_pago == "PAGADO":
        raise HTTPException(status_code=400, detail="Operación rechazada: El gasto ya se encuentra totalmente PAGADO.")
    
    # Heredar datos operativos del gasto
    pago.id_dam = gasto.id_dam
    pago.id_concepto = gasto.id_concepto

    # Validar que el concepto exista
    concepto_existe = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == pago.id_concepto).first()
    if not concepto_existe:
        raise HTTPException(status_code=404, detail="El concepto de pago no existe en el catálogo.")

    # 2. Lógica de Parche de Auditoría (Tipo de Cambio SUNAT)
    tc_aplicado = pago.tipo_cambio
    if not tc_aplicado or tc_aplicado <= Decimal("0.00"):
        tc_sunat = db.query(models.HistorialTipoCambio).filter(models.HistorialTipoCambio.fecha == date.today()).first()
        if not tc_sunat:
            raise HTTPException(
                status_code=400, 
                detail="No se proporcionó un tipo de cambio y no hay registro oficial de SUNAT para el día de hoy. Regístrelo en el sistema."
            )
        tc_aplicado = tc_sunat.precio_venta
        pago.tipo_cambio = tc_aplicado
    
    pago.tipo_cambio_aplicado = tc_aplicado

    # 3. Validación Financiera Estricta (Saldos)
    pagos_existentes = db.query(models.RegistroPago).filter(
        models.RegistroPago.id_gasto == pago.id_gasto,
        models.RegistroPago.estado_registro == "ACTIVO"
    ).all()

    total_ya_pagado = Decimal("0.00")
    for p in pagos_existentes:
        importe_db = Decimal(str(p.importe))
        tc_db = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio))
        if p.moneda == "USD":
            total_ya_pagado += importe_db
        elif p.moneda == "PEN":
            total_ya_pagado += (importe_db / tc_db)

    monto_gasto_usd = Decimal(str(gasto.monto_usd))
    saldo_pendiente = monto_gasto_usd - total_ya_pagado

    # Calcular el importe real ingresado a moneda dura (USD)
    nuevo_importe_usd = Decimal("0.00")
    if pago.moneda == "USD":
        nuevo_importe_usd = pago.importe
    elif pago.moneda == "PEN":
        nuevo_importe_usd = pago.importe / tc_aplicado

    # Tolerancia por diferenciales cambiarios
    margen_tolerancia = Decimal("0.05")
    
    if nuevo_importe_usd > (saldo_pendiente + margen_tolerancia):
        saldo_formateado = saldo_pendiente.quantize(Decimal("0.01"))
        raise HTTPException(
            status_code=400, 
            detail=f"Sobrepago detectado. El importe ingresado supera el saldo pendiente. Saldo restante original: USD {saldo_formateado}"
        )

    # 4. Guardar Pago Principal
    try:
        nuevo_pago = models.RegistroPago(**pago.model_dump())
        db.add(nuevo_pago)
        
        saldo_pendiente_nuevo = saldo_pendiente - nuevo_importe_usd

        # Cerrar el gasto si el pago es exacto (o se pasa por centavos permitidos)
        if saldo_pendiente_nuevo <= Decimal("0.00"):
            gasto.estado_pago = "PAGADO"
            
        # 5. Cierre Automático ZD (Ajuste Ficticio por centavos restantes)
        elif Decimal("0.00") < saldo_pendiente_nuevo <= margen_tolerancia:
            pago_ajuste = models.RegistroPago(
                id_dam=gasto.id_dam,
                id_concepto=gasto.id_concepto,
                moneda="USD",
                importe=saldo_pendiente_nuevo,
                tipo_cambio=Decimal("1.00"),
                tipo_cambio_aplicado=Decimal("1.00"),
                estado_pago="PAGADO",
                fecha_pago=date.today(),
                numero_operacion="AJUSTE-ZD",
                id_banco=pago.id_banco,
                id_empresa=pago.id_empresa,
                id_gasto=gasto.id_gasto,
                es_ajuste_sistema=True
            )
            db.add(pago_ajuste)
            gasto.estado_pago = "PAGADO"

        db.commit()
        db.refresh(nuevo_pago)
        
        # --- AUDITORÍA: Registro de Creación ---
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion="CREACION PAGO",
            detalles=pago.model_dump_json(), # Pydantic V2
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

        return nuevo_pago
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error en transacción: {str(e)}")
@app.put("/pagos/{id_pago}", response_model=schemas.RegistroPago)
def actualizar_pago(id_pago: int, pago_editado: schemas.RegistroPagoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_pago = db.query(models.RegistroPago).filter(models.RegistroPago.id_pago == id_pago).first()
    if not db_pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
        
    update_data = pago_editado.model_dump(exclude_unset=True)
    
    # Candado de Auditoría Financiera
    if "importe" in update_data or "moneda" in update_data:
        raise HTTPException(
            status_code=403,
            detail="Acción rechazada por Auditoría: No se permite modificar el importe ni la moneda de un pago ya registrado. Si hubo un error, proceda a la anulación o extorno."
        )
        
    for key, value in update_data.items():
        setattr(db_pago, key, value)
        
    db.commit()
    db.refresh(db_pago)
    return db_pago

# --- ENDPOINT ANALÍTICO: ESTADO DE CUENTA ---
@app.get("/maestros/{id_maestro}/estado_cuenta", response_model=schemas.EstadoCuentaFacturaResumen)
def estado_cuenta_factura(
    id_maestro: int, 
    tipo_cambio_referencial: Decimal = Query(Decimal("3.80"), description="Tipo de cambio referencial para gastos en USD"), 
    db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)
):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="Factura/Maestro no encontrado")

    total_general_gastos_pen = Decimal("0.00")
    total_general_pagado_pen = Decimal("0.00")
    desglose_dams = []

    for dam in maestro.dams:
        total_gastos_dam_pen = Decimal("0.00")
        total_pagado_dam_pen = Decimal("0.00")

        # 1. Sumar gastos de la DAM
        for gasto in dam.gastos:
            if gasto.estado_registro == "ACTIVO":
                monto_usd = Decimal(str(gasto.monto_usd)) if gasto.monto_usd else Decimal("0.00")
                total_gastos_dam_pen += monto_usd * tipo_cambio_referencial

        # 2. Sumar pagos de la DAM
        for pago in dam.pagos:
            if pago.estado_registro == "ACTIVO":
                importe = Decimal(str(pago.importe)) if pago.importe else Decimal("0.00")
                if pago.moneda == "USD":
                    tc_pago = Decimal(str(pago.tipo_cambio)) if pago.tipo_cambio else Decimal("1.00")
                    total_pagado_dam_pen += importe * tc_pago
                elif pago.moneda == "PEN":
                    total_pagado_dam_pen += importe

        saldo_pendiente_dam_pen = total_gastos_dam_pen - total_pagado_dam_pen

        total_general_gastos_pen += total_gastos_dam_pen
        total_general_pagado_pen += total_pagado_dam_pen

        desglose_dams.append(schemas.EstadoCuentaDam(
            id_dam=dam.id_dam,
            numero_de_dam=dam.numero_de_dam,
            total_gastos_pen=total_gastos_dam_pen,
            total_pagado_pen=total_pagado_dam_pen,
            saldo_pendiente_pen=saldo_pendiente_dam_pen
        ))

    saldo_general_pendiente_pen = total_general_gastos_pen - total_general_pagado_pen
    
    if total_general_gastos_pen > Decimal("0.00"):
        porcentaje_amortizado = (total_general_pagado_pen / total_general_gastos_pen) * Decimal("100.00")
    else:
        porcentaje_amortizado = Decimal("0.00")

    return schemas.EstadoCuentaFacturaResumen(
        id_maestro=maestro.id_maestro,
        numero_factura=maestro.numero_factura,
        documento_transporte=maestro.documento_transporte,
        total_general_gastos_pen=total_general_gastos_pen,
        total_general_pagado_pen=total_general_pagado_pen,
        saldo_general_pendiente_pen=saldo_general_pendiente_pen,
        porcentaje_amortizado=porcentaje_amortizado,
        desglose_dams=desglose_dams
    )

# --- ENDPOINTS PARA CONCEPTOS ---
@app.post("/conceptos/", response_model=schemas.CatConceptoPago)
def crear_concepto(concepto: schemas.CatConceptoPagoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    try:
        nuevo_concepto = models.CatConceptoPago(**concepto.model_dump())
        db.add(nuevo_concepto)
        db.commit()
        db.refresh(nuevo_concepto)
        return nuevo_concepto
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al crear el concepto. Verifica que no esté duplicado.")

@app.get("/conceptos/", response_model=List[schemas.CatConceptoPago])
def listar_conceptos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.CatConceptoPago).filter(models.CatConceptoPago.estado_registro == "ACTIVO").all()

@app.delete("/conceptos/{id_concepto}")
def eliminar_concepto(id_concepto: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    concepto = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    if not concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")
    
    concepto.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El concepto '{concepto.nombre}' ha sido eliminado lógicamente (INACTIVO)."}

# --- RUTAS DE LECTURA (GET) GENERALES ---
@app.get("/bancos/", response_model=List[schemas.CatBanco])
def listar_bancos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.CatBanco).all()

@app.get("/maestros/", response_model=List[schemas.MaestroImportacion])
def listar_facturas(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.MaestroImportacion).all()

@app.get("/reporte-maestro/{id_maestro}", response_model=schemas.MaestroConDetalles)
def reporte_completo_factura(id_maestro: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura

@app.get("/gastos/", response_model=List[schemas.RegistroGasto])
def listar_gastos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.RegistroGasto).all()

# --- RUTAS DE ELIMINACIÓN/ANULACIÓN ---
@app.delete("/maestros/{id_maestro}")
def anular_factura(id_maestro: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not db_factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    db_factura.estado_registro = "ANULADO" 
    db.commit()
    return {"mensaje": f"Factura {db_factura.numero_factura} marcada como ANULADA correctamente."}

@app.put("/bancos/{id_banco}", response_model=schemas.CatBanco)
def actualizar_banco(id_banco: int, banco_editado: schemas.CatBancoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_banco = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not db_banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    
    db_banco.nombre = banco_editado.nombre
    db.commit()
    db.refresh(db_banco)
    return db_banco

# --- ENDPOINT DE AUDITORÍA ---
@app.get("/auditoria/", response_model=List[schemas.AuditLog])
def listar_auditoria(
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 4])) # 1: Admin, 4: Auditor
):
    return db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(100).all()
