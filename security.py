import os
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
import jwt

from dotenv import load_dotenv

load_dotenv()

# Configuración de bcrypt para el hashing de contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Constantes de Seguridad (Obligatorio desde variable de entorno)
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("La variable de entorno SECRET_KEY no está configurada. Verifica tu archivo .env")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# --- Sesión por cookie httpOnly ---
# El JWT viaja en una cookie que JavaScript NO puede leer (httpOnly): un XSS no puede robar la sesión.
COOKIE_SESION = "erp_session"
# Secure=True exige HTTPS. Actívelo (COOKIE_SECURE=true) cuando el sistema se sirva por HTTPS;
# en la red local por HTTP debe quedar en false o el navegador no guardará la cookie.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() == "true"
# Encabezado que el frontend envía en cada petición. Un sitio externo no puede agregarlo sin pasar
# el control CORS, lo que bloquea ataques CSRF aunque el navegador adjunte la cookie.
CSRF_HEADER = "X-Requested-With"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica que la contraseña en texto plano coincida con el hash de la BD."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera un hash bcrypt a partir de una contraseña en texto plano."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Crea y firma el token JWT."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    # iat: momento de emisión. Permite invalidar las sesiones anteriores a un cambio de contraseña.
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt
