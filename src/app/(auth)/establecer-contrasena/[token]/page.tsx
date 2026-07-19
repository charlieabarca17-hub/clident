import { FormularioEstablecerPassword } from "../formulario";

export default async function EstablecerPasswordDesdeRutaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  return <FormularioEstablecerPassword token={token} error={error} />;
}
