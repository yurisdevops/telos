import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

export const expoDb = openDatabaseSync('telos.db');

export const db = drizzle(expoDb, { schema });
