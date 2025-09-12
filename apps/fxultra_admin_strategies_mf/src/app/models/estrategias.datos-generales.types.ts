/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Tipos de estrategia (conexión backend)
 * ───────────────────────────────────────────────────────────────────────────── */
export type ProductoAsociado = 'COMPRA_VENTA' | 'POSTURAS';
export type ModoOperacion    = 'HORARIOS' | 'RANGOS' | 'HORARIOS-RANGOS';

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Payload del paso 1
 * ───────────────────────────────────────────────────────────────────────────── */
export interface DatosGeneralesRequest {
  nombre: string;
  descripcion: string;
  productoAsociado: ProductoAsociado;
  modoOperacion: ModoOperacion;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Respuesta del paso 1
 * ───────────────────────────────────────────────────────────────────────────── */
export interface DatosGeneralesResponse {
  idEstrategia: number;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Catálogos
 * ───────────────────────────────────────────────────────────────────────────── */
export interface ProductoAsociadoCatalogo {
  codigo: string;       // "COMPRA_VENTA" | "POSTURAS"
  descripcion: string;  // "Compra venta" | "Posturas"
}

export interface ModoOperacionCatalogo {
  codigo: ModoOperacion;   // "HORARIOS" | "RANGOS" | "HORARIOS-RANGOS"
  descripcion: string;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 2 – Pares de divisas
 * ───────────────────────────────────────────────────────────────────────────── */
export interface ParDivisaCatalogo {
  claveParDivisa: string; // Ejemplo: "USD-MXN"
  descripcion?: string;
}

export interface ConfiguracionDivisasRequest {
  idEstrategia: number;
  divisas: Array<{
    claveParDivisa: string;
    montoMaximo: number;
  }>;
}

export interface ConfiguracionDivisasResponse {
  idEstrategia: number;
  divisas: Array<{
    claveParDivisa: string;
    idDivisaEstrategia: number;
    montoMaximo: number;
  }>;
}
