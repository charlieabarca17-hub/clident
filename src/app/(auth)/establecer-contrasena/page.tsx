import { FormularioEstablecerPassword } from "./formulario";

export default async function EstablecerPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  return <FormularioEstablecerPassword token={token} error={error} />;
}
