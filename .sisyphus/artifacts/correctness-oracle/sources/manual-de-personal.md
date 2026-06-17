# 🧑‍🤝‍🧑 DIRECTORIO DE EQUIPOS POR CÓDIGO POSTAL

### Códigos 78744 y 78640 (Austin / Kyle)

- **Yessica:** Equipo principal. Lunes a viernes (7 horas, 10AM–5PM) y sábados (11AM - 3PM).
- **Diana:** Exclusiva para la propiedad `271 Gina Dr` (78640) todos los días. También es backup entre semana en el resto de los códigos 78744 y 78640 (excepto los domingos).
- Berenice: equipos de backup para fines de semana, o si Yessica excede sus 7 horas diarias.
- Angela: Si el equipo principal requiere viernes y sábados.
- Susana: equipo de backup para fines de semana, o si Yessica excede sus 7 horas diarias.

### Códigos 78203 y 78109 (San Antonio / Converse)

- **Zenaida:** Equipo primario, disponible todos los días.
- **Norma:** No disponible por el momento. Fines de semana y backup.

### Código 80421 (Bailey, CO)

- **Mary or Carrie**

## ⚙️ REGLAS LÓGICAS DE PROGRAMACIÓN

1. Regla de Cobro (Check-In): El costo y tiempo de limpieza se calcula siempre en base a los CHECK-INs, no a los CHECK-OUTs. Ejemplos: Si un Home hace checkout y 4 Rooms hacen check-in, se cobran los 4 cuartos. Si 4 Rooms hacen checkout y un Home hace check-in, se cobra el Home. Si hay checkout sin check-in ese día, se cobra como cuartos (no como Home). El output debe indicar claramente qué hace CHECK-IN y qué hace CHECK-OUT para que el limpiador tenga contexto completo.
2. **Tiempos Extra por Traslado (Operational Overhead):**
   - Solo aplica para los códigos 78744 y 78640.
   - Si no hay check-ins ni limpiezas programadas en el día, pero hay tareas de basura pendientes, programa 45 minutos de traslado (ida y vuelta desde el hogar del limpiador a la propiedad).
3. **Distribución Equitativa:** Si hay múltiples equipos operando en el mismo código postal un mismo día, se debe intentar repartir las salidas de una misma casa (ej. varios cuartos) a una sola persona, y equilibrar la carga de horas de manera justa.
4. **Reglas de Basura:**
   - **ZIPs 78744 y 78640:** Programar recordatorio 1 día antes de la recolección. Si el día de recolección es el lunes, el recordatorio debe hacerse desde el viernes y mantenerse durante el fin de semana.
   - **ZIPs 78203 y 78109:** Programar recordatorio 2 días antes, y nuevamente 1 día antes.
   - Si el día analizado es el día siguiente a la recolección en esa propiedad, añadir la tarea: _"Confirmar recolección y guardar botes"_. Los recordatorios de sacar los botes y meterlos deben agregarse aunque no tenga agendadas limpiezas en ese día.
