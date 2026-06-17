# Oráculo de Corrección — 2026-06-22 (Lunes)

> Derivado desde cero a partir de las fuentes primarias. NO consulta el output del empleado existente.
> Fuentes: reporte-financiero.md, manual-de-personal.md, directorio-operativo.md, checkouts.json

---

## 1. Datos del Día

- **Fecha:** 2026-06-22
- **Día de la semana:** Lunes
- **Total de checkouts:** 1

---

## 2. Checkouts del Día (desde checkouts.json)

| #   | Propiedad        | Unidad | ZIP   | Check-in previo | Check-out        |
| --- | ---------------- | ------ | ----- | --------------- | ---------------- |
| 1   | 6002 Palm Circle | Casa   | 78741 | 2026-06-21      | 2026-06-22 11:00 |

---

## 3. Aplicación de Regla 1 — Cobro por Check-Ins

**Regla:** El costo y tiempo se calcula en base a los CHECK-INs, no a los CHECK-OUTs. Si hay checkout sin check-in ese día, se cobra como cuartos (no como Home).

**Análisis:** El archivo checkouts.json solo contiene el checkout del día. El campo `checkIn` (2026-06-21) es la fecha de llegada del huésped ACTUAL, no un check-in nuevo el 2026-06-22.

**⚠️ AMBIGÜEDAD #1:** No se dispone de un archivo de check-ins para 2026-06-22. No podemos confirmar si hay nuevos huéspedes llegando ese día. Aplicamos la regla conservadora: **checkout sin check-in ese día → cobrar como cuartos (no como Home)**.

**Resultado:** 6002 Palm Circle solo tiene un tipo de unidad: Home ($130 / 180 min). No existe distinción entre Home y Rooms en esta propiedad — es una sola unidad. Se cobra como Casa ($130 / 180 min) independientemente de la regla de check-ins.

---

## 4. Asignación de Limpiadores

### 4.1 ZIP 78741 — 6002 Palm Circle

**⚠️ AMBIGÜEDAD #2 (CRÍTICA):** El Manual de Personal NO asigna explícitamente ningún limpiador al ZIP 78741. El Directorio Operativo agrupa 78724, 78741 y 78722 juntos pero el Manual solo cubre 78744/78640, 78203/78109 y 80421.

**Para el oráculo:** Se marca como **SIN ASIGNACIÓN CONFIRMADA**.

| Propiedad        | Unidad | Tiempo  | Limpiadora                                                   |
| ---------------- | ------ | ------- | ------------------------------------------------------------ |
| 6002 Palm Circle | Casa   | 180 min | ⚠️ NO ASIGNADO (ZIP 78741 no cubierto en Manual de Personal) |

---

## 5. Tareas de Basura — 2026-06-22 (Lunes)

### Reglas aplicables:

- **78744/78640:** Recordatorio 1 día antes de recolección. Si recolección es Lunes → recordatorio desde Viernes y durante fin de semana (no aplica hoy — hoy ES Lunes).
- **78203/78109:** Recordatorio 2 días antes Y 1 día antes.
- **Día siguiente a recolección:** Agregar "Confirmar recolección y guardar botes".

### Análisis por propiedad:

**7213 Nutria Run (78744) — Recolección: Lunes (Sacar Domingo)**

- Hoy ES el día de recolección. Los botes se sacaron el Domingo.
- El día siguiente a la recolección es Martes → "Confirmar recolección y guardar botes" se programa para el Martes, no hoy.
- ❌ Sin acción de basura hoy para 7213 Nutria Run.

**271 Gina Dr (78640) — Recolección: Lunes (Sacar Domingo)**

- Hoy ES el día de recolección. Los botes se sacaron el Domingo.
- "Confirmar recolección y guardar botes" → Martes.
- ❌ Sin acción de basura hoy para 271 Gina Dr.

**3401 Breckenridge Dr (78744) — Recolección: Martes (Sacar Lunes)**

- "Sacar Lunes" = sacar botes hoy (Lunes). Recolección mañana (Martes).
- Regla 78744: recordatorio 1 día antes = Lunes ✅
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**3412 Sand Dunes Ave (78744) — Recolección: Martes (Sacar Lunes)**

- Misma lógica que 3401 Breckenridge.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**3420 Hovenweep Ave (78744) — Recolección: Martes (Sacar Lunes)**

- Misma lógica.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**4403 Hayride Ln (78744) — Recolección: Jueves (Sacar Miércoles)**

- Lunes es 3 días antes del Jueves. Recordatorio = Miércoles (1 día antes).
- ❌ Sin acción hoy.

**4405 Hayride Ln (78744) — Recolección: Jueves (Sacar Miércoles)**

- ❌ Sin acción hoy.

**4410 Hayride Ln (78744) — Recolección: Jueves (Sacar Miércoles)**

- ❌ Sin acción hoy.

**407 S Gevers St (78203) — Recolección: Martes y Jueves (Sacar Lunes y Miércoles)**

- "Sacar Lunes" = sacar botes hoy. Recolección mañana (Martes).
- Regla 78203: recordatorio 2 días antes (Domingo — ayer) Y 1 día antes (Lunes — hoy).
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**219 Paul St (78203) — Recolección: Martes y Jueves (bote siempre en la calle)**

- Lunes es 1 día antes del Martes.
- Regla 78203: recordatorio 1 día antes.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**
- Nota: El bote siempre está en la calle — no se requiere acción física, pero el recordatorio aplica.

**6930 Heron Flats (78109) — Recolección: Martes (Sacar Lunes)**

- Lunes es 1 día antes del Martes.
- Regla 78109 (mismo grupo que 78203): recordatorio 2 días antes Y 1 día antes.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**8039 Chestnut Cedar (78109) — Recolección: Martes (Sacar Lunes)**

- Misma lógica que 6930 Heron Flats.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**6002 Palm Circle (78741) — Recolección: Martes (Sacar Lunes)**

- "Sacar Lunes" = sacar botes hoy. Recolección mañana (Martes).
- **⚠️ AMBIGÜEDAD #3:** ZIP 78741 no tiene regla de basura explícita en el Manual de Personal. Si se aplica la regla de 78744/78640 por analogía (1 día antes = Lunes): ✅ recordatorio hoy. Pero es una inferencia.
- Inferencia aplicada: ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**

**3505 Banton Rd (78722) — Recolección: Viernes (Sacar Jueves)**

- Lunes es 4 días antes del Viernes.
- **⚠️ AMBIGÜEDAD #4:** ZIP 78722 sin regla de basura explícita.
- ❌ Sin acción confirmada.

### Regla 2 — Travel Overhead (78744/78640):

**Condición:** Si no hay check-ins ni limpiezas programadas en el día, pero hay tareas de basura pendientes → 45 minutos de traslado.

**Análisis para Yessica (78744, Lunes disponible 10AM–5PM):**

- No hay checkouts en 78744 el 2026-06-22.
- Hay tareas de basura en 78744: 3401 Breckenridge, 3412 Sand Dunes, 3420 Hovenweep (todas Sacar Lunes).
- Condición cumplida: solo basura, sin limpiezas.
- ✅ **Yessica: +45 min de traslado (overhead)**

**Análisis para Diana (78640, Lunes disponible):**

- No hay checkouts en 78640 el 2026-06-22.
- 271 Gina Dr: recolección fue hoy (Lunes) — los botes se sacaron el Domingo. No hay tarea de basura hoy para 271 Gina Dr.
- ❌ Diana no tiene tareas de basura en 78640 hoy. Sin overhead.

---

## 6. Resumen del Schedule Correcto

### Sin asignación confirmada (ZIP 78741)

| Tarea    | Propiedad               | Tiempo  | Nota                                |
| -------- | ----------------------- | ------- | ----------------------------------- |
| Limpieza | 6002 Palm Circle — Casa | 180 min | ⚠️ ZIP 78741 sin limpiador asignado |

### Yessica (78744 — Austin, Lunes 10AM–5PM, solo basura)

| Tarea               | Propiedad                                                             | Tiempo                |
| ------------------- | --------------------------------------------------------------------- | --------------------- |
| Traslado (overhead) | —                                                                     | 45 min                |
| Basura              | 3401 Breckenridge Dr — Recordatorio sacar basura (recolección Martes) | —                     |
| Basura              | 3412 Sand Dunes Ave — Recordatorio sacar basura (recolección Martes)  | —                     |
| Basura              | 3420 Hovenweep Ave — Recordatorio sacar basura (recolección Martes)   | —                     |
| **TOTAL**           |                                                                       | **45 min (traslado)** |

### Zenaida (78203 — San Antonio, solo basura)

| Tarea              | Propiedad                                                        | Tiempo                  |
| ------------------ | ---------------------------------------------------------------- | ----------------------- |
| Basura             | 407 S Gevers St — Recordatorio sacar basura (recolección Martes) | —                       |
| Basura             | 219 Paul St — Recordatorio sacar basura (recolección Martes)     | —                       |
| **TOTAL limpieza** |                                                                  | **0 min (solo basura)** |

### Zenaida / Equipo 78109 (solo basura)

| Tarea              | Propiedad                                                            | Tiempo                  |
| ------------------ | -------------------------------------------------------------------- | ----------------------- |
| Basura             | 6930 Heron Flats — Recordatorio sacar basura (recolección Martes)    | —                       |
| Basura             | 8039 Chestnut Cedar — Recordatorio sacar basura (recolección Martes) | —                       |
| **TOTAL limpieza** |                                                                      | **0 min (solo basura)** |

**Nota:** El Manual de Personal asigna Zenaida a 78203 y 78109. Se asume que Zenaida cubre ambos ZIPs para las tareas de basura.

---

## 7. Totales por Limpiadora (Aritmética Explícita)

| Limpiadora     | Limpiezas                   | Tiempo Limpieza | Overhead         |
| -------------- | --------------------------- | --------------- | ---------------- |
| ⚠️ Sin asignar | 6002 Palm Circle Casa (180) | **180 min**     | —                |
| Yessica        | Solo basura (0 limpiezas)   | **0 min**       | +45 min traslado |
| Zenaida        | Solo basura (0 limpiezas)   | **0 min**       | —                |

**Total general de limpieza:** 180 min (sin asignar) + 0 + 0 = **180 min (3h)**

---

## 8. Ambigüedades Identificadas

1. **Check-ins del día desconocidos:** El snapshot solo contiene checkouts. No hay datos de nuevos check-ins para 2026-06-22. Se aplica la regla conservadora. En este caso no cambia el resultado porque 6002 Palm Circle solo tiene un tipo de unidad (Casa).

2. **ZIP 78741 sin limpiador asignado:** El Manual de Personal no cubre 78741. 6002 Palm Circle (Casa, 180 min) no tiene limpiador confirmado. Es la ambigüedad más crítica de este día.

3. **Regla de basura para 78741:** No hay regla explícita de basura para 78741. Se aplica la regla de 78744/78640 por analogía (1 día antes = Lunes para recolección Martes), pero es una inferencia.

4. **Regla de basura para 78722:** No hay regla explícita para 78722. 3505 Banton Rd no recibe tarea de basura hoy por falta de regla aplicable.

5. **Overhead de traslado para Yessica:** La Regla 2 dice "45 minutos de traslado" como overhead único (ida y vuelta). No queda claro si aplica una vez por día o una vez por propiedad visitada. Se interpreta como overhead único por día (45 min total, no 45 min × 3 propiedades).
