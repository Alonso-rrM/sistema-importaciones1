import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from fastapi.responses import JSONResponse
from security import COOKIE_SESION, CSRF_HEADER
from dependencies import limiter
from routers import auditoria, auth, catalogos, finanzas, integraciones, operaciones, reportes, usuarios

# La documentación interactiva (/docs, /redoc, /openapi.json) expone el mapa completo de la API.
# Desactivada por defecto; para desarrollo, definir ENABLE_DOCS=true en el .env
_docs_habilitados = os.getenv("ENABLE_DOCS", "false").strip().lower() == "true"
app = FastAPI(
    title="API de Importaciones y Pagos",
    docs_url="/docs" if _docs_habilitados else None,
    redoc_url="/redoc" if _docs_habilitados else None,
    openapi_url="/openapi.json" if _docs_habilitados else None,
)

# Configuración Global de Rate Limiting (SlowAPI)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

cors_env = os.getenv("CORS_ORIGINS")
origins = [o.strip() for o in cors_env.split(",") if o.strip()] if cors_env else ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def proteccion_csrf(request: Request, call_next):
    """
    Con sesión por cookie, el navegador adjunta la cookie automáticamente. Para que otro sitio no pueda
    disparar escrituras en nombre de la usuaria (CSRF), toda operación de escritura autenticada por
    cookie debe traer el header X-Requested-With, que un sitio ajeno no puede enviar sin pasar CORS.
    (Complementa SameSite=Strict de la cookie.)
    """
    if (
        request.method not in _METODOS_SEGUROS
        and COOKIE_SESION in request.cookies
        and not request.headers.get("authorization")
        and not request.headers.get(CSRF_HEADER)
    ):
        return JSONResponse(status_code=403, content={"detail": "Solicitud rechazada por protección CSRF."})
    return await call_next(request)


# Inclusión de Routers Modulares (Arquitectura Limpia / Strangler Fig)
app.include_router(auth.router)
app.include_router(catalogos.router)
app.include_router(operaciones.router)
app.include_router(finanzas.router)
app.include_router(reportes.router)
app.include_router(usuarios.router)
app.include_router(integraciones.router)
app.include_router(auditoria.router)

@app.get("/")
def ruta_principal():
    return {"mensaje": "¡Servidor de Importaciones funcionando al 100%!"}
