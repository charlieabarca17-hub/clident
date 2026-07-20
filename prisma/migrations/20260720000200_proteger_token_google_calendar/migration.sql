-- Las tablas nuevas heredan los privilegios por defecto configurados para
-- clident_readonly. Esta conexión contiene un refresh token cifrado y no forma
-- parte de reportes, así que se revoca incluso SELECT como segunda barrera
-- además de RLS.
REVOKE ALL PRIVILEGES ON TABLE "conexiones_google_calendar" FROM clident_readonly;
