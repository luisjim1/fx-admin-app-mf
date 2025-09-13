/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Tipos de estrategia
 * ───────────────────────────────────────────────────────────────────────────── */
export type ProductoAsociado = 'COMPRA_VENTA' | 'POSTURAS';
export type ModoOperacion    = 'HORARIOS' | 'RANGOS' | 'HORARIOS-RANGOS';

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 1
 * ───────────────────────────────────────────────────────────────────────────── */
export interface DatosGeneralesRequest {
  nombre: string;
  descripcion: string;
  productoAsociado: ProductoAsociado;
  modoOperacion: ModoOperacion;
}
export interface DatosGeneralesResponse { idEstrategia: number; }

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Catálogos Paso 1
 * ───────────────────────────────────────────────────────────────────────────── */
export interface ProductoAsociadoCatalogo { codigo: string; descripcion: string; }
export interface ModoOperacionCatalogo { codigo: ModoOperacion; descripcion: string; }

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 2 – Pares de divisas
 * ───────────────────────────────────────────────────────────────────────────── */
export interface ParDivisaCatalogo {
  claveParDivisa: string;
  descripcion?: string;
}
export interface ConfiguracionDivisasRequest {
  idEstrategia: number;
  divisas: Array<{ claveParDivisa: string; montoMaximo: number; }>;
}
export interface ConfiguracionDivisasResponse {
  idEstrategia: number;
  divisas: Array<{ claveParDivisa: string; idDivisaEstrategia: number; montoMaximo: number; }>;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 3 – Sentido de operación
 * ───────────────────────────────────────────────────────────────────────────── */
export type SentidoOperacion = 'COMPRA' | 'VENTA' | 'COMPRA_VENTA';
export interface SentidoOperacionCatalogo { codigo: SentidoOperacion; descripcion: string; }
export interface ListadoSentidoOperacionDivisaRequest {
  idEstrategia: number;
  divisas: Array<{ idDivisaEstrategia: number; sentidoOperacion: SentidoOperacion; }>;
}
export interface ListadoDivisasResponse {
  idEstrategia: number;
  divisas: Array<{ idDivisaEstrategia: number; claveParDivisa: string; }>;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 4 – Fecha de liquidación
 * Back enum: TODAY | TOM | SPOT | ONE_D
 * ───────────────────────────────────────────────────────────────────────────── */
export type FechaLiquidacion = 'TODAY' | 'TOM' | 'SPOT' | 'ONE_D';
export interface FechaLiquidacionCatalogo { codigo: FechaLiquidacion; descripcion: string; }

export interface FechasLiquidacionRequest {
  idEstrategia: number;
  fechasLiquidacionDivisas: Array<{
    idDivisaEstrategia: number;
    fechasLiquidacion: FechaLiquidacion[];
  }>;
}
export interface FechasLiquidacionResponse {
  idEstrategia: number;
  fechasLiquidacionDivisas: Array<{
    idDivisaEstrategia: number;
    fechasLiquidacion: FechaLiquidacion[];
  }>;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 5 – Horarios
 * Formato de horas: 'HH:mm'
 * ───────────────────────────────────────────────────────────────────────────── */
export interface HorarioTramo {
  horaInicio: string; // 'HH:mm'
  horaFin: string;    // 'HH:mm'
}
export interface HorarioDivisaItem {
  idDivisaEstrategia: number;
  horarios: HorarioTramo[]; // uno o varios tramos por divisa
}
export interface ListadoHorariosEstrategiaRequest {
  idEstrategia: number;
  divisas: HorarioDivisaItem[];
}
export interface ListadoHorariosEstrategiaResponse {
  idEstrategia: number;
  divisas: Array<{ idDivisaEstrategia: number }>;
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 6 – Spreads (contrato simple del back)
 * Nota: Dejamos ambas propiedades opcionales para compatibilidad:
 *       - spreadsDivisa (actual del back)
 *       - spreads      (nombre anterior que podría seguir usando código legado)
 * ───────────────────────────────────────────────────────────────────────────── */
export interface SpreadDivisaItem {
  idDivisaEstrategia: number;
  spreadPuntos: number; // puntos/pips
}
export interface ListadoSpreadsDivisaRequest {
  idEstrategia: number;
  spreadsDivisa?: SpreadDivisaItem[]; // contrato vigente
  spreads?: SpreadDivisaItem[];       // compatibilidad hacia atrás
}
export interface ListadoSpreadsDivisaResponse {
  idEstrategia: number;
  spreadsDivisa?: Array<{ idDivisaEstrategia: number; spreadPuntos: number }>; // preferido
  spreads?: Array<{ idDivisaEstrategia: number; spreadPuntos: number }>;       // legacy
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 6 – Spreads (alias con ventanas por horario)
 * Útil si tu UI maneja múltiples ventanas y luego haces un reduce/promedio.
 * ───────────────────────────────────────────────────────────────────────────── */
export interface SpreadsWindow {
  horaInicio: string;   // 'HH:mm'
  horaFin: string;      // 'HH:mm'
  spreadCompra: number; // buy
  spreadVenta: number;  // sell
}
export interface SpreadsDivisaWindows {
  idDivisaEstrategia: number;
  spreads: SpreadsWindow[];
}
export interface SpreadsRequest {
  idEstrategia: number;
  spreadsDivisas: SpreadsDivisaWindows[];
}
export interface SpreadsResponse {
  idEstrategia: number;
  spreadsDivisas: SpreadsDivisaWindows[];
}

/** ─────────────────────────────────────────────────────────────────────────────
 * Sección: Paso 7 – Previsualización (placeholder)
 * ───────────────────────────────────────────────────────────────────────────── */
export interface PrevisualizacionEstrategiaResponse {
  idEstrategia: number;
  // Completar cuando el back publique el contrato consolidado:
  // datosGenerales?: { ... };
  // divisas?: Array<{ ... }>;
  // fechasLiquidacion?: Array<{ ... }>;
  // horarios?: Array<{ ... }>;
  // spreads?: Array<{ ... }>;
}
