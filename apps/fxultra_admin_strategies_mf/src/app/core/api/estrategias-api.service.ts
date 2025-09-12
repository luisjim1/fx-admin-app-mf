// apps/fxultra_admin_strategies_mf/src/app/core/api/estrategias-api.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ESTRATEGIAS_API_BASE_URL } from './api.config';
import {
  DatosGeneralesRequest,
  DatosGeneralesResponse,
  ProductoAsociadoCatalogo,
  ModoOperacionCatalogo,
  // Paso 2
  ParDivisaCatalogo,
  ConfiguracionDivisasRequest,
  ConfiguracionDivisasResponse
} from '../../models/estrategias.datos-generales.types';

@Injectable({ providedIn: 'root' })
export class EstrategiasApiService {
  private readonly base = ESTRATEGIAS_API_BASE_URL;

  /* ────────────────────────────────────────────────────────────────────────────
     Rutas
     ──────────────────────────────────────────────────────────────────────────── */
  // Paso 1
  private readonly R_DATOS_GENERALES       = `${this.base}/estrategias/datos-generales`;
  private readonly CAT_PRODUCTOS           = `${this.base}/catalogos/productos-asociados`;
  private readonly CAT_MODOS               = `${this.base}/catalogos/modos-operacion`;

  // Paso 2
  private readonly CAT_PARES_DIVISA        = `${this.base}/catalogos/pares-divisa`;
  private readonly R_CONFIGURACION_DIVISAS = `${this.base}/estrategias/configuracion-divisas`;

  private readonly jsonHeaders = new HttpHeaders({ 'Content-Type': 'application/json' });

  constructor(private http: HttpClient) {}

  /* ────────────────────────────────────────────────────────────────────────────
     Paso 1: Datos Generales
     ──────────────────────────────────────────────────────────────────────────── */
  postDatosGenerales(payload: DatosGeneralesRequest): Observable<DatosGeneralesResponse> {
    return this.http
      .post(`${this.R_DATOS_GENERALES}`, payload, {
        headers: this.jsonHeaders,
        observe: 'response',
        responseType: 'text',
      })
      .pipe(
        map((resp: HttpResponse<string>) => {
          const body = resp.body ?? '';
          try {
            return JSON.parse(body) as DatosGeneralesResponse;
          } catch {
            return {} as DatosGeneralesResponse;
          }
        }),
        tap(res => {
          if (res?.idEstrategia != null) {
            localStorage.setItem('wizard_idEstrategia', String(res.idEstrategia));
          }
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error en Datos Generales';
          if (typeof err?.error === 'string' && err.error.trim()) {
            msg = err.error.trim();
          } else if (err?.error && typeof (err.error as any).message === 'string') {
            msg = (err.error as any).message;
          } else if (typeof err?.message === 'string' && err.message) {
            msg = err.message;
          }
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ────────────────────────────────────────────────────────────────────────────
     Catálogos (Paso 1)
     ──────────────────────────────────────────────────────────────────────────── */
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

  /* ────────────────────────────────────────────────────────────────────────────
     Paso 2: Pares de divisas / montos
     ──────────────────────────────────────────────────────────────────────────── */
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
        observe: 'response',
        responseType: 'text',
      })
      .pipe(
        map((resp: HttpResponse<string>) => {
          const body = resp.body ?? '';
          try {
            return JSON.parse(body) as ConfiguracionDivisasResponse;
          } catch {
            return {
              idEstrategia: payload.idEstrategia,
              divisas: payload.divisas.map(d => ({
                claveParDivisa: d.claveParDivisa,
                idDivisaEstrategia: 0,
                montoMaximo: d.montoMaximo
              }))
            } as ConfiguracionDivisasResponse;
          }
        }),
        tap(respuesta => {
          if (respuesta?.divisas?.length) {
            localStorage.setItem('wizard_step2_divisas_ids', JSON.stringify(respuesta.divisas));
          }
        }),
        catchError((err: HttpErrorResponse) => {
          let msg = 'Error en configuración de divisas';
          if (typeof err?.error === 'string' && err.error.trim()) {
            msg = err.error.trim();
          } else if (err?.error && typeof (err.error as any).message === 'string') {
            msg = (err.error as any).message;
          } else if (typeof err?.message === 'string' && err.message) {
            msg = err.message;
          }
          return throwError(() => new Error(msg));
        })
      );
  }

  /* ────────────────────────────────────────────────────────────────────────────
     Futuro (referencia): lectura/edición Step 2
     ──────────────────────────────────────────────────────────────────────────── */
  // getConfiguracionDivisas(idEstrategia: number): Observable<ConfiguracionDivisasResponse> {
  //   return this.http.get<ConfiguracionDivisasResponse>(
  //     `${this.base}/estrategias/${idEstrategia}/configuracion-divisas`,
  //     { headers: this.jsonHeaders }
  //   );
  // }

  // patchConfiguracionDivisas(payload: ConfiguracionDivisasRequest): Observable<void> {
  //   return this.http.patch<void>(this.R_CONFIGURACION_DIVISAS, payload, {
  //     headers: this.jsonHeaders
  //   });
  // }

  /* ────────────────────────────────────────────────────────────────────────────
     Futuro (referencia): lectura de Datos Generales
     ──────────────────────────────────────────────────────────────────────────── */
  // getDatosGenerales(id: number): Observable<DatosGeneralesDetalle> {
  //   return this.http.get<DatosGeneralesDetalle>(`${this.base}/estrategias/${id}`);
  // }

  // patchDatosGenerales(payload: DatosGeneralesRequest & { idEstrategia: number }): Observable<void> {
  //   return this.http.patch<void>(`${this.base}/estrategias/datos-generales`, payload, {
  //     headers: this.jsonHeaders,
  //   });
  // }
}
