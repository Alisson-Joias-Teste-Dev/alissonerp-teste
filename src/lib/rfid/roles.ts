export const ROLES_CADASTRAR_RFID = [
  "admin",
  "desenvolvedor",
  "gerente_fabrica",
  "estoquista_fabrica",
  "gerente_loja",
] as const;

export const ROLES_CALIBRAR_RFID = [
  "admin",
  "desenvolvedor",
  "gerente_fabrica",
] as const;

export type RoleCadastrar = (typeof ROLES_CADASTRAR_RFID)[number];
export type RoleCalibrar = (typeof ROLES_CALIBRAR_RFID)[number];
