# Oráculo de Corrección — 2026-06-15 (Domingo)

> Derivado desde cero a partir de las fuentes primarias. NO consulta el output del empleado existente.
> Fuentes: reporte-financiero.md, manual-de-personal.md, directorio-operativo.md, checkouts.json

---

## 1. Datos del Día

- **Fecha:** 2026-06-15
- **Día de la semana:** Domingo
- **Total de checkouts:** 5

---

## 2. Checkouts del Día (desde checkouts.json)

| #   | Propiedad       | Unidad       | ZIP   | Check-in previo | Check-out        |
| --- | --------------- | ------------ | ----- | --------------- | ---------------- |
| 1   | 271 Gina Dr     | Habitación 2 | 78640 | 2026-06-12      | 2026-06-15 11:00 |
| 2   | 3505 Banton Rd  | Habitación 1 | 78722 | 2026-06-14      | 2026-06-15 11:00 |
| 3   | 3505 Banton Rd  | Habitación 2 | 78722 | 2026-06-12      | 2026-06-15 11:00 |
| 4   | 3505 Banton Rd  | Habitación 3 | 78722 | 2026-06-12      | 2026-06-15 11:00 |
| 5   | 7213 Nutria Run | Habitación 1 | 78744 | 2026-06-12      | 2026-06-15 11:00 |

---

## 3. Aplicación de Regla 1 — Cobro por Check-Ins

**Regla:** El costo y tiempo se calcula en base a los CHECK-INs, no a los CHECK-OUTs. Si hay checkout sin check-in ese día, se cobra como cuartos (no como Home).

**Análisis:** El archivo checkouts.json solo contiene los checkouts del día. Los campos `checkIn` en el JSON son las fechas de llegada de los huéspedes ACTUALES (ninguno llega el 2026-06-15). No hay datos de check-ins nuevos para este día en el snapshot disponible.

**⚠️ AMBIGÜEDAD #1:** No se dispone de un archivo de check-ins para 2026-06-15. No podemos confirmar si hay nuevos huéspedes llegando ese día. Aplicamos la regla conservadora: **checkout sin check-in ese día → cobrar como cuartos (no como Home)**.

**Resultado:** Todas las unidades se cobran por su tipo individual:

- 271 Gina Dr Hab 2: Habitación ($30 / 25 min)
- 3505 Banton Rd Hab 1, 2, 3: Habitaciones ($30 c/u / 25 min c/u)
- 7213 Nutria Run Hab 1: Habitación ($30 / 25 min)

---

## 4. Asignación de Limpiadores

### 4.1 ZIP 78640 (Kyle) — Diana

**Regla:** Diana es EXCLUSIVA para 271 Gina Dr todos los días (incluyendo domingos).

| Propiedad   | Unidad       | Tiempo |
| ----------- | ------------ | ------ |
| 271 Gina Dr | Habitación 2 | 25 min |

**Total Diana:** **25 min**

### 4.2 ZIP 78744 (Austin) — Domingo

**Disponibilidad domingo:**

- Yessica: NO disponible (solo Lunes–Viernes + Sábados)
- Diana: NO disponible para 78744 los domingos (backup solo entre semana, excepto domingos)
- Berenice: ✅ Disponible (backup fines de semana)
- Susana: ✅ Disponible (backup fines de semana)
- Angela: Para cuando el equipo principal requiere viernes Y sábados — no aplica para domingo

**Carga 78744:**

- 7213 Nutria Run: Hab 1 (25 min)
- **Total: 25 min**

**Asignación:** Berenice (o Susana — ver Ambigüedad #2)

| Limpiadora | Propiedad       | Unidad       | Tiempo |
| ---------- | --------------- | ------------ | ------ |
| Berenice   | 7213 Nutria Run | Habitación 1 | 25 min |

**Total Berenice:** **25 min**

### 4.3 ZIP 78722 — 3505 Banton Rd

**⚠️ AMBIGÜEDAD #2 (CRÍTICA):** El Manual de Personal NO asigna explícitamente ningún limpiador al ZIP 78722. El Directorio Operativo agrupa 78724, 78741 y 78722 juntos pero el Manual solo cubre 78744/78640, 78203/78109 y 80421.

**Para el oráculo:** Se marca como **SIN ASIGNACIÓN CONFIRMADA**.

| Propiedad      | Unidad       | Tiempo | Limpiadora                                                   |
| -------------- | ------------ | ------ | ------------------------------------------------------------ |
| 3505 Banton Rd | Habitación 1 | 25 min | ⚠️ NO ASIGNADO (ZIP 78722 no cubierto en Manual de Personal) |
| 3505 Banton Rd | Habitación 2 | 25 min | ⚠️ NO ASIGNADO                                               |
| 3505 Banton Rd | Habitación 3 | 25 min | ⚠️ NO ASIGNADO                                               |

**Total sin asignar:** 25 + 25 + 25 = **75 min**

---

## 5. Tareas de Basura — 2026-06-15 (Domingo)

### Reglas aplicables:

- **78744/78640:** Recordatorio 1 día antes de recolección. Si recolección es Lunes → recordatorio desde Viernes y durante todo el fin de semana.
- **78203/78109:** Recordatorio 2 días antes Y 1 día antes.
- **Día siguiente a recolección:** Agregar "Confirmar recolección y guardar botes".

### Análisis por propiedad:

**7213 Nutria Run (78744) — Recolección: Lunes**

- Domingo es 1 día antes del Lunes.
- Regla especial: "Si el día de recolección es el lunes, el recordatorio debe hacerse desde el viernes y mantenerse durante el fin de semana."
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Lunes)**
- Responsable: Berenice (asignada a 7213 Nutria Run ese día)

**271 Gina Dr (78640) — Recolección: Lunes**

- Domingo es 1 día antes del Lunes.
- Misma regla especial: recordatorio desde Viernes y durante fin de semana.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Lunes)**
- Responsable: Diana (exclusiva para 271 Gina Dr)

**407 S Gevers St (78203) — Recolección: Martes y Jueves**

- Domingo es 2 días antes del Martes.
- Regla 78203: recordatorio 2 días antes Y 1 día antes.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**
- Responsable: Zenaida (equipo primario 78203)
- Nota: No hay checkout en 407 S Gevers St el 2026-06-15. La tarea de basura aplica aunque no haya limpieza programada.

**219 Paul St (78203) — Recolección: Martes y Jueves (bote siempre en la calle)**

- Domingo es 2 días antes del Martes.
- Regla 78203: recordatorio 2 días antes Y 1 día antes.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Martes)**
- Nota: El bote siempre está en la calle — no se requiere acción física de sacar, pero el recordatorio aplica.
- Responsable: Zenaida

**3505 Banton Rd (78722) — Recolección: Viernes**

- Domingo es 5 días antes del Viernes.
- **⚠️ AMBIGÜEDAD #3:** Las reglas de basura solo están definidas para 78744/78640 (1 día antes) y 78203/78109 (2 días antes + 1 día antes). El ZIP 78722 no tiene regla de basura explícita en el Manual de Personal.
- Inferencia: si se aplica la regla de 78744/78640 (1 día antes), el recordatorio sería el Jueves. Domingo no es día de recordatorio.
- ❌ Sin acción de basura confirmada para 3505 Banton Rd el Domingo.

**4403 Hayride Ln (78744) — Recolección: Jueves**

- Domingo es 4 días antes del Jueves.
- Regla 78744: 1 día antes = Miércoles. Domingo no es día de recordatorio.
- ❌ Sin acción de basura.

**Zenaida — tareas de basura sin limpieza:**

- No hay checkouts en 78203 el 2026-06-15.
- Zenaida tiene tareas de basura (recordatorios para 407 S Gevers y 219 Paul St).
- **Regla 2 (Travel Overhead):** Solo aplica para 78744/78640. Para 78203 no hay overhead de traslado definido.
- ❌ No aplica overhead de traslado para Zenaida.

---

## 6. Resumen del Schedule Correcto

### Diana (78640 — Kyle)

| Tarea              | Propiedad                                                   | Tiempo     |
| ------------------ | ----------------------------------------------------------- | ---------- |
| Limpieza           | 271 Gina Dr — Habitación 2                                  | 25 min     |
| Basura             | 271 Gina Dr — Recordatorio sacar basura (recolección Lunes) | —          |
| **TOTAL limpieza** |                                                             | **25 min** |

### Berenice (78744 — Austin, backup domingo)

| Tarea              | Propiedad                                                       | Tiempo     |
| ------------------ | --------------------------------------------------------------- | ---------- |
| Limpieza           | 7213 Nutria Run — Habitación 1                                  | 25 min     |
| Basura             | 7213 Nutria Run — Recordatorio sacar basura (recolección Lunes) | —          |
| **TOTAL limpieza** |                                                                 | **25 min** |

### Zenaida (78203 — San Antonio, solo basura)

| Tarea              | Propiedad                                                        | Tiempo                  |
| ------------------ | ---------------------------------------------------------------- | ----------------------- |
| Basura             | 407 S Gevers St — Recordatorio sacar basura (recolección Martes) | —                       |
| Basura             | 219 Paul St — Recordatorio sacar basura (recolección Martes)     | —                       |
| **TOTAL limpieza** |                                                                  | **0 min (solo basura)** |

### Sin asignación confirmada (ZIP 78722)

| Tarea    | Propiedad                     | Tiempo | Nota                                |
| -------- | ----------------------------- | ------ | ----------------------------------- |
| Limpieza | 3505 Banton Rd — Habitación 1 | 25 min | ⚠️ ZIP 78722 sin limpiador asignado |
| Limpieza | 3505 Banton Rd — Habitación 2 | 25 min | ⚠️ ZIP 78722 sin limpiador asignado |
| Limpieza | 3505 Banton Rd — Habitación 3 | 25 min | ⚠️ ZIP 78722 sin limpiador asignado |

---

## 7. Totales por Limpiadora (Aritmética Explícita)

| Limpiadora     | Limpiezas                                     | Tiempo Total |
| -------------- | --------------------------------------------- | ------------ |
| Diana          | 271 Gina Dr Hab 2 (25)                        | **25 min**   |
| Berenice       | 7213 Nutria Hab 1 (25)                        | **25 min**   |
| Zenaida        | Solo basura (0 limpiezas)                     | **0 min**    |
| ⚠️ Sin asignar | 3505 Banton Hab1 (25) + Hab2 (25) + Hab3 (25) | **75 min**   |

**Total general de limpieza:** 25 + 25 + 0 + 75 = **125 min (2h 5min)**

---

## 8. Ambigüedades Identificadas

1. **Check-ins del día desconocidos:** El snapshot solo contiene checkouts. No hay datos de nuevos check-ins para 2026-06-15. Se aplica la regla conservadora (cobrar como cuartos, no como Home).

2. **ZIP 78722 sin limpiador asignado:** El Manual de Personal no cubre 78722. 3505 Banton Rd (3 habitaciones, 75 min total) no tiene limpiador confirmado. La propiedad está en Austin pero no se puede inferir con certeza qué equipo la cubre.

3. **Berenice vs Susana para 78744 domingo:** Ambas son backup para fines de semana. El Manual no especifica cuál tiene prioridad. Se asigna Berenice (listada primero) pero Susana es igualmente válida.

4. **Regla de basura para 78722:** Las reglas de basura solo están definidas para 78744/78640 y 78203/78109. No hay regla explícita para 78722. Se omite la tarea de basura para 3505 Banton Rd por falta de regla aplicable.

5. **Zenaida sin limpiezas — ¿se programa?** Zenaida tiene tareas de basura (recordatorios) pero ninguna limpieza el 2026-06-15. La Regla 2 de overhead de traslado solo aplica para 78744/78640, no para 78203. No hay overhead definido para Zenaida en este caso.
