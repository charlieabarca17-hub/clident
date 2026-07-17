-- array_length('{}', 1) devuelve NULL y un CHECK acepta NULL.
-- cardinality devuelve 0, por lo que una membresía sin roles falla cerrada.
ALTER TABLE "membresias" DROP CONSTRAINT "membresias_con_rol";
ALTER TABLE "membresias"
  ADD CONSTRAINT "membresias_con_rol" CHECK (cardinality("roles") >= 1);
