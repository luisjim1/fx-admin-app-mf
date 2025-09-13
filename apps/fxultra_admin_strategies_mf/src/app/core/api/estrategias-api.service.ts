import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ESTRATEGIAS_API_BASE_URL } from './api.config';

import {
  // Paso 1
  DatosGeneralesRequest,
  DatosGeneralesResponse,
  ProductoAsociadoCatalogo,
  ModoOperacionCatalogo,
  // Paso 2
  ParDivisaCatalogo,
  ConfiguracionDivisasRequest,
  ConfiguracionDivisasResponse,
  // Paso 3
  SentidoOperacionCatalogo,
  ListadoSentidoOperacionDivisaRequest,
  ListadoDivisasResponse,
  // Paso 4
  FechaLiquidacionCatalogo,
  FechasLiquidacionRequest,
  FechasLiquidacionResponse,
  // Paso 5
  ListadoHorariosEstrategiaRequest,
  ListadoHorariosEstrategiaResponse,
  // Paso 6 (contratos previos – los dejamos por compatibilidad de tipos)
  ListadoSpreadsDivisaRequest,
  ListadoSpreadsDivisaResponse,
  // Paso 7 (placeholder)
  PrevisualizacionEstrategiaResponse
} from '../../models/estrategias.datos-generales.types';

@Injectable({ providedIn: 'root' })
export class EstrategiasApiService {
  private readonly base = ESTRATEGIAS_API_BASE_URL;

  // Paso 1
  private readonly R_DATOS_GENERALES       = `${this.base}/estrategias/datos-generales`;
  private readonly CAT_PRODUCTOS           = `${this.base}/catalogos/productos-asociados`;
  private readonly CAT_MODOS               = `${this.base}/catalogos/modos-operacion`;

  // Paso 2
  private readonly CAT_PARES_DIVISA        = `${this.base}/catalogos/pares-divisa`;
  private readonly R_CONFIGURACION_DIVISAS = `${this.base}/estrategias/configuracion-divisas`;

  // Paso 3
  private readonly CAT_SENTIDO_OP          = `${this.base}/catalogos/sentido-operacion`;
  private readonly R_SENTIDO_OP            = `${this.base}/estrategias/sentido-operacion`;

  // Paso 4
  private readonly CAT_FECHAS_LIQ          = `${this.base}/catalogos/fechas-liquidacion`;
  private readonly R_FECHAS_LIQ            = `${this.base}/estrategias/fechas-liquidacion`;

  // Paso 5
  private readonly R_HORARIOS              = `${this.base}/estrategias/horarios`;

  // Paso 6
  private readonly R_SPREADS               = `${this.base}/estrategias/spreads`;

  // LocalStorage
  private static readonly K_HORARIOS = 'wizard_horarios';

  private readonly jsonHeaders = new HttpHeaders({ 'Content-Type': 'application/json' });
  private readonly http = inject(HttpClient);

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 1
     ─────────────────────────────────────────────────────────────────────────── */
  postDatosGenerales(payload: DatosGeneralesRequest): Observable<DatosGeneralesResponse> {
    return this.http
      .post(this.R_DATOS_GENERALES, payload, {
        headers: this.jsonHeaders,
        responseType: 'text' as const,
      })
      .pipe(
        map((body: string) => {
          try { return JSON.parse(body) as DatosGeneralesResponse; }
          catch { return {} as DatosGeneralesResponse; }
        }),
        tap((res) => {
          if (res?.idEstrategia != null) localStorage.setItem('wizard_idEstrategia', String(res.idEstrategia));
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error en Datos Generales';
          if (typeof err?.error === 'string' && err.error.trim()) msg = err.error.trim();
          else if ((err?.error as any)?.message) msg = (err.error as any).message;
          else if (err?.message) msg = err.message;
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Catálogos Paso 1
     ─────────────────────────────────────────────────────────────────────────── */
  getProductosAsociados(): Observable<ProductoAsociadoCatalogo[]> {
    return this.http
      .get<ProductoAsociadoCatalogo[]>(this.CAT_PRODUCTOS, { headers: this.jsonHeaders })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const msg =
            (typeof err?.error === 'string' && err.error.trim()) ? err.error.trim()
            : (err.error as any)?.message || err.message || 'Error al cargar productos asociados';
          return throwError(() => new Error(msg));
        })
      );
  }

  getModosOperacion(): Observable<ModoOperacionCatalogo[]> {
    return this.http
      .get<ModoOperacionCatalogo[]>(this.CAT_MODOS, { headers: this.jsonHeaders })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const msg =
            (typeof err?.error === 'string' && err.error.trim()) ? err.error.trim()
            : (err.error as any)?.message || err.message || 'Error al cargar modos de operación';
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 2
     ─────────────────────────────────────────────────────────────────────────── */
  getParesDivisa(): Observable<ParDivisaCatalogo[]> {
    return this.http
      .get<ParDivisaCatalogo[]>(this.CAT_PARES_DIVISA, { headers: this.jsonHeaders })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const msg =
            (typeof err?.error === 'string' && err.error.trim()) ? err.error.trim()
            : (err.error as any)?.message || err.message || 'Error al cargar pares de divisa';
          return throwError(() => new Error(msg));
        })
      );
  }

  postConfiguracionDivisas(payload: ConfiguracionDivisasRequest): Observable<ConfiguracionDivisasResponse> {
    return this.http
      .post(this.R_CONFIGURACION_DIVISAS, payload, {
        headers: this.jsonHeaders,
        responseType: 'text' as const,
      })
      .pipe(
        map((body: string) => {
          try { return JSON.parse(body) as ConfiguracionDivisasResponse; }
          catch {
            return {
              idEstrategia: payload.idEstrategia,
              divisas: (payload.divisas ?? []).map(d => ({
                claveParDivisa: d.claveParDivisa,
                idDivisaEstrategia: 0,
                montoMaximo: d.montoMaximo
              }))
            } as ConfiguracionDivisasResponse;
          }
        }),
        tap((respuesta) => {
          if (respuesta?.divisas?.length) {
            localStorage.setItem('wizard_step2_divisas_ids', JSON.stringify(respuesta.divisas));
          }
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error en configuración de divisas';
          if (typeof err?.error === 'string' && err.error.trim()) msg = err.error.trim();
          else if ((err?.error as any)?.message) msg = (err.error as any).message;
          else if (err?.message) msg = err.message;
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 3
     ─────────────────────────────────────────────────────────────────────────── */
  getSentidosOperacion(): Observable<SentidoOperacionCatalogo[]> {
    return this.http
      .get<SentidoOperacionCatalogo[]>(this.CAT_SENTIDO_OP, { headers: this.jsonHeaders })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const msg =
            (typeof err?.error === 'string' && err.error.trim()) ? err.error.trim()
            : (err.error as any)?.message || err.message || 'Error al cargar sentido de operación';
          return throwError(() => new Error(msg));
        })
      );
  }

  patchSentidoOperacion(req: ListadoSentidoOperacionDivisaRequest): Observable<ListadoDivisasResponse> {
    return this.http
      .patch(this.R_SENTIDO_OP, req, {
        headers: this.jsonHeaders,
        responseType: 'text' as const,
      })
      .pipe(
        map((body: string) => {
          try { return JSON.parse(body) as ListadoDivisasResponse; }
          catch {
            return {
              idEstrategia: req.idEstrategia,
              divisas: (req.divisas ?? []).map(d => ({
                idDivisaEstrategia: d.idDivisaEstrategia,
                claveParDivisa: ''
              }))
            } as ListadoDivisasResponse;
          }
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error al actualizar sentido de operación';
          if (typeof err?.error === 'string' && err.error.trim()) msg = err.error.trim();
          else if ((err?.error as any)?.message) msg = (err.error as any).message;
          else if (err?.message) msg = err.message;
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 4
     ─────────────────────────────────────────────────────────────────────────── */
  getFechasLiquidacion(): Observable<FechaLiquidacionCatalogo[]> {
    return this.http
      .get<FechaLiquidacionCatalogo[]>(this.CAT_FECHAS_LIQ, { headers: this.jsonHeaders })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const msg =
            (typeof err?.error === 'string' && err.error.trim()) ? err.error.trim()
            : (err.error as any)?.message || err.message || 'Error al cargar catálogo de fechas de liquidación';
          return throwError(() => new Error(msg));
        })
      );
  }

  postFechasLiquidacion(payload: FechasLiquidacionRequest): Observable<FechasLiquidacionResponse> {
    return this.http
      .post(this.R_FECHAS_LIQ, payload, {
        headers: this.jsonHeaders,
        responseType: 'text' as const,
      })
      .pipe(
        map((body: string) => {
          try { return JSON.parse(body) as FechasLiquidacionResponse; }
          catch {
            return {
              idEstrategia: payload.idEstrategia,
              fechasLiquidacionDivisas: (payload.fechasLiquidacionDivisas ?? []).map(d => ({
                idDivisaEstrategia: d.idDivisaEstrategia,
                fechasLiquidacion: (d as any).fechasLiquidacion ?? []
              }))
            } as unknown as FechasLiquidacionResponse;
          }
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error al registrar fechas de liquidación';
          if (typeof err?.error === 'string' && err.error.trim()) msg = err.error.trim();
          else if ((err?.error as any)?.message) msg = (err.error as any).message;
          else if (err?.message) msg = err.message;
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 5
     ─────────────────────────────────────────────────────────────────────────── */
  postHorariosEstrategia(payload: ListadoHorariosEstrategiaRequest): Observable<ListadoHorariosEstrategiaResponse> {
    return this.http
      .post(this.R_HORARIOS, payload, {
        headers: this.jsonHeaders,
        responseType: 'text' as const,
      })
      .pipe(
        map((body: string) => {
          try { return JSON.parse(body) as any; }
          catch {
            return {
              idEstrategia: payload.idEstrategia,
              divisas: (payload.divisas ?? []).map(d => ({
                idDivisaEstrategia: d.idDivisaEstrategia
              }))
            } as ListadoHorariosEstrategiaResponse;
          }
        }),
        tap((res: any) => this.persistHorariosIdsFromResponse(res)),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error al registrar horarios de estrategia';
          if (typeof err?.error === 'string' && err.error.trim()) msg = err.error.trim();
          else if ((err?.error as any)?.message) msg = (err.error as any).message;
          else if (err?.message) msg = err.message;
          return throwError(() => new Error(msg));
        })
      );
  }

  /** Recupera horarios por estrategia (ruta correcta: /estrategias/{id}/horarios) y los persiste en LS */
  getHorariosPorEstrategia(idEstrategia: number): Observable<any> {
    return this.http
      .get<any>(`${this.base}/estrategias/${idEstrategia}/horarios`, { headers: this.jsonHeaders })
      .pipe(
        tap((res) => this.persistHorariosIdsFromResponse(res)),
        catchError((err: HttpErrorResponse) => {
          const msg =
            (typeof err?.error === 'string' && err.error.trim()) ? err.error.trim()
            : (err.error as any)?.message || err.message || 'Error al consultar horarios por estrategia';
          return throwError(() => new Error(msg));
        })
      );
  }

  /** Persiste en LS un mapa: byDivisa[idDivisaEstrategia] = [{ idHorarioEstrategia, horaInicio, horaFin }, ...] */
  private persistHorariosIdsFromResponse(res: any): void {
    try {
      const byDivisa: Record<number, Array<{ idHorarioEstrategia: number; horaInicio: string; horaFin: string }>> = {};
      const divisas = Array.isArray(res?.divisas) ? res.divisas : [];
      for (const d of divisas) {
        const idDiv = Number(d?.idDivisaEstrategia);
        const horas = Array.isArray(d?.horariosEstrategia) ? d.horariosEstrategia : [];
        if (Number.isFinite(idDiv) && horas.length) {
          const mapped = horas
            .map((h: any) => ({
              idHorarioEstrategia: Number(h?.idHorarioEstrategia),
              horaInicio: (h?.horaInicio || '').trim(),
              horaFin: (h?.horaFin || '').trim(),
            }))
            .filter((row: any) => Number.isFinite(row.idHorarioEstrategia));
          if (mapped.length) byDivisa[idDiv] = mapped;
        }
      }
      if (Object.keys(byDivisa).length) {
        const toStore = { byDivisa, timestamp: Date.now() };
        localStorage.setItem(EstrategiasApiService.K_HORARIOS, JSON.stringify(toStore));
      }
    } catch { /* noop */ }
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 6 – Spreads (nuevo contrato con spreadsHorario)
     ─────────────────────────────────────────────────────────────────────────── */

  /**
   * Envia: {
   *   idEstrategia,
   *   spreadsDivisa: [
   *     { idDivisaEstrategia, spreadsHorario: [{ idHorarioEstrategia, spreadCompra, spreadVenta, idSpreadHorario? }, ...] }
   *   ]
   * }
   */
  postSpreads(payload: any): Observable<any> {
    return this.http
      .post(this.R_SPREADS, payload, {
        headers: this.jsonHeaders,
        responseType: 'text' as const,
      })
      .pipe(
        map((body: string) => {
          try { return JSON.parse(body); }
          catch { return body as any; }
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error al registrar spreads';
          if (typeof err?.error === 'string' && err.error.trim()) msg = err.error.trim();
          else if ((err?.error as any)?.message) msg = (err.error as any).message;
          else if (err?.message) msg = err.message;
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ───────────────────────────────────────────────────────────────────────────
     Paso 7 (comentado hasta contrato)
     ─────────────────────────────────────────────────────────────────────────── */
  // getPrevisualizacion(idEstrategia: number): Observable<PrevisualizacionEstrategiaResponse> {
  //   return this.http.get<PrevisualizacionEstrategiaResponse>(this.R_PREVISUALIZACION.replace('{id}', String(idEstrategia)), {
  //     headers: this.jsonHeaders
  //   });
  // }
}
