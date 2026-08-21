@echo off
REM Limpia la cache de iconos de Windows (IconCache.db) para que la barra de
REM tareas muestre el icono nuevo de Tiancode. Ejecutar como administrador:
REM clic derecho sobre este archivo > "Ejecutar como administrador".
REM Cierra el explorador, borra las caches y lo reinicia (el escritorio
REM parpadea un instante; es normal).
echo Cerrando el explorador...
taskkill /f /im explorer.exe >nul 2>&1
echo Borrando caches de iconos...
del /f /q "%LOCALAPPDATA%\IconCache.db" >nul 2>&1
del /f /q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache_*.db" >nul 2>&1
echo Reiniciando el explorador...
start explorer.exe
echo Listo. El icono de Tiancode deberia verse ya en la barra de tareas.
pause
