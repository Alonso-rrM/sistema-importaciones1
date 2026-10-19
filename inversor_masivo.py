import os
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN ---
API_URL = os.getenv("API_URL", "http://localhost:8000")
# El Token JWT del administrador debe definirse en .env o en el entorno
TOKEN = os.getenv("ADMIN_JWT_TOKEN", "")
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def limpiar_datos(row_dict):
    """Limpia los NaN, formatea fechas, traduce columnas y parsea números."""
    cleaned = {}
    for k, v in row_dict.items():
        # Ignorar valores nulos (celdas vacías) para no enviar basura a la API
        if pd.isna(v):
            continue 
            
        # 1. Traductor dinámico de columnas (De Excel a BD)
        nuevo_k = "nombre" if k in ["nombre_banco", "razon_social", "nombre_rol"] else k
        
        # 2. Formateo estricto
        if nuevo_k == "ruc":
            # Pandas a veces lee los números grandes como float (ej. 20614.0). 
            # int() quita el decimal, str() lo vuelve texto.
            cleaned[nuevo_k] = str(int(v))
        elif isinstance(v, pd.Timestamp):
            cleaned[nuevo_k] = v.strftime('%Y-%m-%d')
        else:
            cleaned[nuevo_k] = v
            
    return cleaned

def inyectar_excel(nombre_archivo, endpoint):
    ruta = f"plantillas/{nombre_archivo}"
    print(f"\n⏳ Procesando {ruta} hacia /{endpoint}...")
    try:
        df = pd.read_excel(ruta)
    except FileNotFoundError:
        print(f"⚠️ Archivo no encontrado: {ruta}. Saltando...")
        return

    exitos, errores = 0, 0

    for index, row in df.iterrows():
        payload = limpiar_datos(row.to_dict())
        try:
            res = requests.post(f"{API_URL}/{endpoint}", json=payload, headers=HEADERS)
            if res.status_code in [200, 201]:
                exitos += 1
            else:
                errores += 1
                print(f"  ❌ Error Fila {index+2} (Excel): {res.status_code} - {res.text}")
        except Exception as e:
            errores += 1
            print(f"  ❌ Excepción Fila {index+2}: {str(e)}")
            
    print(f"✅ {nombre_archivo}: {exitos} insertados | {errores} errores.")

if __name__ == "__main__":
    print("🚀 INICIANDO INGESTA MASIVA DE DATOS...")
    
    # El orden es ESTRICTO por la integridad referencial (Foreign Keys)
    inyectar_excel("1_roles.xlsx", "roles/")
    inyectar_excel("1_bancos.xlsx", "bancos/")
    inyectar_excel("1_conceptos.xlsx", "conceptos/")
    inyectar_excel("1_proveedores.xlsx", "proveedores/")
    inyectar_excel("1_agentes.xlsx", "agentes/")
    inyectar_excel("1_importadores.xlsx", "importadores/")
    
    # Nivel 2 depende del Nivel 1
    inyectar_excel("2_usuarios.xlsx", "usuarios/")
    
    print("\n🎉 INGESTA DE CATÁLOGOS FINALIZADA.")
