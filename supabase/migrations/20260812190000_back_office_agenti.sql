-- ASSOCIAZIONE agente -> back office (Luca 12/08): le pratiche degli agenti
-- del mondo agenzia in Tracking PDA sono responsabilita del back office
-- associato (oggi Alex Coviello) - visibilita e malus a lui, mai all'agente.
alter table app_users add column if not exists back_office_id uuid;
