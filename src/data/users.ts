import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export interface User {
  username: string;
  password: string;
}

const password = process.env.USER_PASSWORD ?? 'secret_sauce';

export const users = {
  standard: { username: process.env.STANDARD_USER ?? 'standard_user', password },
  lockedOut: { username: process.env.LOCKED_USER ?? 'locked_out_user', password },
  invalid: { username: 'usuario_inexistente', password: 'clave_incorrecta' },
} satisfies Record<string, User>;
