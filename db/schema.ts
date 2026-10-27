import {sqliteTable,text,integer,real,index} from 'drizzle-orm/sqlite-core';
export const portfolios=sqliteTable('portfolios',{userId:text('user_id').primaryKey(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(0),updatedAt:text('updated_at').notNull()});

// Compact current checkpoint; market observations are stored separately from holdings.
export const performanceStates=sqliteTable('performance_states',{
 userId:text('user_id').primaryKey(),payload:text('payload').notNull(),version:integer('version').notNull().default(0),updatedAt:text('updated_at').notNull(),
});

export const performancePoints=sqliteTable('performance_points',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),capturedAt:text('captured_at').notNull(),value:real('value_brl').notNull(),unitIndex:real('unit_index').notNull(),netFlow:real('net_flow').notNull(),income:real('income_brl').notNull(),benchmarks:text('benchmarks').notNull(),baseline:integer('baseline').notNull().default(0),
},table=>[index('performance_points_user_time').on(table.userId,table.capturedAt)]);
