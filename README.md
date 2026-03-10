# 🚨 Alarma Comunitaria

Sistema de alarma comunitaria web que permite a los vecinos emitir alertas de emergencia y recibir respuesta de su comunidad en tiempo real.

## Funcionalidades

- 🔐 **Registro/Login** de usuarios con nombre y dirección
- 🚨 **Botón de pánico** para emitir alertas de emergencia
- 🔴 **Alarma visual** con efecto rojo intermitente
- 🔊 **Sirena sonora** generada con Web Audio API
- 📋 **Selección de causa**: Robo, Incendio, Emergencia Médica, Persona Sospechosa, Accidente de Tránsito, Otro
- 🤝 **Respuestas interactivas**: "Voy en camino", "Pide más antecedentes", "Llamé a Carabineros", "Llamé a Bomberos", "¿Estás bien?"
- 🔄 **Sincronización en tiempo real** entre pestañas del navegador

## Cómo Usar

1. Abre `index.html` en tu navegador
2. Regístrate con tu nombre, dirección y contraseña
3. Presiona el botón **ALARMA** para emitir una alerta
4. Para probar las respuestas, abre otra pestaña con un segundo usuario

## Tecnologías

- HTML5 + CSS3 + JavaScript vanilla
- Web Audio API (sirena)
- BroadcastChannel API (sincronización entre pestañas)
- localStorage (persistencia de datos)

## Licencia

MIT
