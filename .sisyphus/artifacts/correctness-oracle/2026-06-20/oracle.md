# Oráculo de Corrección — 2026-06-20 (Sábado)

> Derivado desde cero a partir de las fuentes primarias. NO consulta el output del empleado existente.
> Fuentes: reporte-financiero.md, manual-de-personal.md, directorio-operativo.md, checkouts.json

---

## 1. Datos del Día

- **Fecha:** 2026-06-20
- **Día de la semana:** Sábado
- **Total de checkouts:** 10

---

## 2. Checkouts del Día (desde checkouts.json)

| #   | Propiedad            | Unidad       | ZIP   | Check-in previo | Check-out        |
| --- | -------------------- | ------------ | ----- | --------------- | ---------------- |
| 1   | 219 Paul St          | Casa         | 78203 | 2026-06-15      | 2026-06-20 11:00 |
| 2   | 271 Gina Dr          | Habitación 4 | 78640 | 2026-06-17      | 2026-06-20 11:00 |
| 3   | 407 S Gevers St      | Loft         | 78203 | 2026-06-14      | 2026-06-20 11:00 |
| 4   | 4403 Hayride Ln      | Unidad A     | 78744 | 2026-06-14      | 2026-06-20 11:00 |
| 5   | 4403 Hayride Ln      | Unidad B     | 78744 | 2026-06-14      | 2026-06-20 11:00 |
| 6   | 4403 Hayride Ln      | Unidad S     | 78744 | 2026-06-14      | 2026-06-20 11:00 |
| 7   | 5306 King Charles Dr | Unidad A     | 78724 | 2026-06-14      | 2026-06-20 11:00 |
| 8   | 7213 Nutria Run      | Habitación 1 | 78744 | 2026-06-15      | 2026-06-20 11:00 |
| 9   | 7213 Nutria Run      | Habitación 3 | 78744 | 2026-06-17      | 2026-06-20 11:00 |
| 10  | 7213 Nutria Run      | Habitación 5 | 78744 | 2026-06-19      | 2026-06-20 11:00 |

---

## 3. Aplicación de Regla 1 — Cobro por Check-Ins

**Regla:** El costo y tiempo se calcula en base a los CHECK-INs, no a los CHECK-OUTs. Si hay checkout sin check-in ese día, se cobra como cuartos (no como Home).

**Análisis:** El archivo checkouts.json solo contiene los checkouts del día. Los campos `checkIn` en el JSON son las fechas de llegada de los huéspedes ACTUALES (ninguno llega el 2026-06-20). No hay datos de check-ins nuevos para este día en el snapshot disponible.

**⚠️ AMBIGÜEDAD #1:** No se dispone de un archivo de check-ins para 2026-06-20. No podemos confirmar si hay nuevos huéspedes llegando ese día. Aplicamos la regla conservadora: **checkout sin check-in ese día → cobrar como cuartos (no como Home)**.

**Resultado:** Todas las unidades se cobran por su tipo individual (Unidad/Habitación/Casa/Loft), no como Home completo.

- 219 Paul St: solo tiene unidad tipo "Casa" (no hay distinción Home vs Rooms en esta propiedad) → se cobra como Casa ($120 / 90 min)
- 271 Gina Dr Hab 4: se cobra como Habitación ($30 / 25 min)
- 407 S Gevers St Loft: se cobra como Loft ($60 / 60 min)
- 4403 Hayride Ln Unidades A, B, S: se cobran como Unidades individuales ($80 c/u / 90 min c/u)
- 5306 King Charles Dr Unidad A: se cobra como Home A ($80 / 90 min) — solo existe un tipo de unidad
- 7213 Nutria Run Hab 1, Hab 3: se cobran como Rooms ($30 c/u / 25 min c/u)
- 7213 Nutria Run Hab 5: se cobra como Room 5 ($40 / 40 min)

---

## 4. Asignación de Limpiadores

### 4.1 ZIP 78203 (San Antonio) — Zenaida

**Regla:** Zenaida es el equipo primario para 78203, disponible todos los días. Norma no disponible actualmente.

| Propiedad       | Unidad | Tiempo |
| --------------- | ------ | ------ |
| 219 Paul St     | Casa   | 90 min |
| 407 S Gevers St | Loft   | 60 min |

**Total Zenaida:** 90 + 60 = **150 min (2h 30min)**

### 4.2 ZIP 78640 (Kyle) — Diana

**Regla:** Diana es EXCLUSIVA para 271 Gina Dr todos los días.

| Propiedad   | Unidad       | Tiempo |
| ----------- | ------------ | ------ |
| 271 Gina Dr | Habitación 4 | 25 min |

**Total Diana:** **25 min**

### 4.3 ZIP 78744 (Austin) — Yessica + Berenice (Sábado)

**Regla Sábado:** Yessica trabaja 11AM–3PM = 4 horas = 240 min máximo. Berenice y Susana son backup para fines de semana.

**Carga total 78744:**

- 4403 Hayride Ln: Unidad A (90) + Unidad B (90) + Unidad S (90) = 270 min
- 7213 Nutria Run: Hab 1 (25) + Hab 3 (25) + Hab 5 (40) = 90 min
- **Total: 270 + 90 = 360 min (6h)**

**Distribución equitativa (Regla 3):** Intentar asignar todos los cuartos de una misma casa a una sola persona.

- **Opción óptima:**
  - Yessica: 7213 Nutria Run completo (90 min) — dentro de su límite de 240 min ✓
  - Berenice: 4403 Hayride Ln completo (270 min = 4.5h) — una sola casa ✓

**Asignación:**

| Limpiadora | Propiedad       | Unidades                     | Tiempo                     |
| ---------- | --------------- | ---------------------------- | -------------------------- |
| Yessica    | 7213 Nutria Run | Hab 1, Hab 3, Hab 5          | 25 + 25 + 40 = **90 min**  |
| Berenice   | 4403 Hayride Ln | Unidad A, Unidad B, Unidad S | 90 + 90 + 90 = **270 min** |

**Total Yessica (78744):** 90 min (dentro de 240 min límite sábado ✓)
**Total Berenice:** 270 min

### 4.4 ZIP 78724 — 5306 King Charles Dr

**⚠️ AMBIGÜEDAD #2 (CRÍTICA):** El Manual de Personal NO asigna explícitamente ningún limpiador al ZIP 78724. El Directorio Operativo agrupa 78724, 78741 y 78722 juntos pero el Manual solo cubre 78744/78640, 78203/78109 y 80421.

**Inferencia razonable (no confirmada por fuentes):** 5306 King Charles Dr está en Austin, geográficamente cercano a las propiedades 78744. El equipo más probable sería Yessica/Berenice/Susana, pero esto NO está documentado.

**Para el oráculo:** Se marca como **SIN ASIGNACIÓN CONFIRMADA**. El schedule correcto debe incluir esta propiedad pero señalar la ambigüedad.

| Propiedad            | Unidad   | Tiempo | Limpiadora                                                   |
| -------------------- | -------- | ------ | ------------------------------------------------------------ |
| 5306 King Charles Dr | Unidad A | 90 min | ⚠️ NO ASIGNADO (ZIP 78724 no cubierto en Manual de Personal) |

---

## 5. Tareas de Basura — 2026-06-20 (Sábado)

### Reglas aplicables:

- **78744/78640:** Recordatorio 1 día antes de recolección. Si recolección es Lunes → recordatorio desde Viernes y durante todo el fin de semana.
- **78203/78109:** Recordatorio 2 días antes Y 1 día antes.
- **Día siguiente a recolección:** Agregar "Confirmar recolección y guardar botes".

### Análisis por propiedad:

**7213 Nutria Run (78744) — Recolección: Lunes**

- Sábado es 2 días antes del Lunes.
- Regla especial: "Si el día de recolección es el lunes, el recordatorio debe hacerse desde el viernes y mantenerse durante el fin de semana."
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Lunes)**
- Responsable: Yessica (asignada a 7213 Nutria Run ese día)

**271 Gina Dr (78640) — Recolección: Lunes**

- Sábado es 2 días antes del Lunes.
- Misma regla especial: recordatorio desde Viernes y durante fin de semana.
- ✅ **ACCIÓN: Recordatorio — Sacar basura (recolección el Lunes)**
- Responsable: Diana (exclusiva para 271 Gina Dr)

**4403 Hayride Ln (78744) — Recolección: Jueves**

- Sábado es 2 días DESPUÉS del Jueves.
- El día siguiente a la recolección (Viernes) ya pasó.
- ❌ Sin acción de basura.

**3505 Banton Rd (78722) — Recolección: Viernes**

- Sábado es el día SIGUIENTE a la recolección del Viernes.
- ✅ **ACCIÓN: Confirmar recolección y guardar botes**
- **⚠️ AMBIGÜEDAD #3:** No hay checkout en 3505 Banton Rd el 2026-06-20 y el ZIP 78722 no tiene limpiador asignado en el Manual de Personal. ¿Quién ejecuta esta tarea?

**407 S Gevers St (78203) — Recolección: Martes y Jueves**

- Sábado: 3 días antes del Martes, 5 días antes del Jueves.
- Regla 78203: recordatorio 2 días antes Y 1 día antes.
- 2 días antes del Martes = Domingo. 1 día antes del Martes = Lunes.
- Sábado NO es día de recordatorio para ninguna recolección.
- ❌ Sin acción de basura.

**219 Paul St (78203) — Recolección: Martes y Jueves (bote siempre en la calle)**

- Misma lógica que 407 S Gevers. Sábado no es día de recordatorio.
- ❌ Sin acción de basura (además el bote siempre está en la calle).

**5306 King Charles Dr (78724) — Recolección: Jueves (propietarios se encargan)**

- ❌ Sin acción para limpiadores.

---

## 6. Resumen del Schedule Correcto

### Zenaida (78203 — San Antonio)

| Tarea     | Propiedad              | Tiempo                 |
| --------- | ---------------------- | ---------------------- |
| Limpieza  | 219 Paul St — Casa     | 90 min                 |
| Limpieza  | 407 S Gevers St — Loft | 60 min                 |
| **TOTAL** |                        | **150 min (2h 30min)** |

### Diana (78640 — Kyle)

| Tarea              | Propiedad                                                   | Tiempo     |
| ------------------ | ----------------------------------------------------------- | ---------- |
| Limpieza           | 271 Gina Dr — Habitación 4                                  | 25 min     |
| Basura             | 271 Gina Dr — Recordatorio sacar basura (recolección Lunes) | —          |
| **TOTAL limpieza** |                                                             | **25 min** |

### Yessica (78744 — Austin, Sábado 11AM–3PM)

| Tarea              | Propiedad                                                       | Tiempo     |
| ------------------ | --------------------------------------------------------------- | ---------- |
| Limpieza           | 7213 Nutria Run — Habitación 1                                  | 25 min     |
| Limpieza           | 7213 Nutria Run — Habitación 3                                  | 25 min     |
| Limpieza           | 7213 Nutria Run — Habitación 5                                  | 40 min     |
| Basura             | 7213 Nutria Run — Recordatorio sacar basura (recolección Lunes) | —          |
| **TOTAL limpieza** |                                                                 | **90 min** |

### Berenice (78744 — Austin, backup sábado)

| Tarea              | Propiedad                  | Tiempo                 |
| ------------------ | -------------------------- | ---------------------- |
| Limpieza           | 4403 Hayride Ln — Unidad A | 90 min                 |
| Limpieza           | 4403 Hayride Ln — Unidad B | 90 min                 |
| Limpieza           | 4403 Hayride Ln — Unidad S | 90 min                 |
| **TOTAL limpieza** |                            | **270 min (4h 30min)** |

### Sin asignación confirmada

| Tarea    | Propiedad                                              | Tiempo | Nota                                          |
| -------- | ------------------------------------------------------ | ------ | --------------------------------------------- |
| Limpieza | 5306 King Charles Dr — Unidad A                        | 90 min | ⚠️ ZIP 78724 sin limpiador asignado en Manual |
| Basura   | 3505 Banton Rd — Confirmar recolección y guardar botes | —      | ⚠️ ZIP 78722 sin limpiador asignado en Manual |

---

## 7. Totales por Limpiadora (Aritmética Explícita)

| Limpiadora     | Limpiezas                                     | Tiempo Total |
| -------------- | --------------------------------------------- | ------------ |
| Zenaida        | 219 Paul St Casa (90) + 407 Gevers Loft (60)  | **150 min**  |
| Diana          | 271 Gina Dr Hab 4 (25)                        | **25 min**   |
| Yessica        | 7213 Nutria Hab1 (25) + Hab3 (25) + Hab5 (40) | **90 min**   |
| Berenice       | 4403 Hayride A (90) + B (90) + S (90)         | **270 min**  |
| ⚠️ Sin asignar | 5306 King Charles A (90)                      | **90 min**   |

**Total general de limpieza:** 150 + 25 + 90 + 270 + 90 = **625 min (10h 25min)**

---

## 8. Ambigüedades Identificadas

1. **Check-ins del día desconocidos:** El snapshot solo contiene checkouts. No hay datos de nuevos check-ins para 2026-06-20. Se aplica la regla conservadora (cobrar como cuartos, no como Home).

2. **ZIP 78724 sin limpiador asignado:** El Manual de Personal no cubre 78724. 5306 King Charles Dr (Unidad A, 90 min) no tiene limpiador confirmado. Inferencia probable: equipo 78744, pero no documentado.

3. **ZIP 78722 sin limpiador asignado:** 3505 Banton Rd tiene tarea de basura (confirmar recolección del Viernes) pero el ZIP 78722 no está en el Manual de Personal.

4. **Berenice vs Susana:** Ambas son backup para fines de semana. El Manual no especifica cuál tiene prioridad. Se asigna Berenice (listada primero) pero Susana es igualmente válida.

5. **Unidad S en 4403 Hayride Ln:** El Reporte Financiero lista Unidades A, B y C. El checkout JSON muestra "Unidad S" (listingName: 4403S-HAY-HOME). No hay tarifa explícita para "Unidad S" en el Reporte Financiero. Se aplica la misma tarifa que A, B, C ($80 / 90 min) por analogía, pero es una ambigüedad.
