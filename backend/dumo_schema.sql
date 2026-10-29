--
-- PostgreSQL database dump
--

\restrict HNelRdjNc4MMGbxqEtW5gokU5ErTlJmQlbVecItC1vwOLf9E7dWmguUwfueVYB5

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_assignments (
    id integer NOT NULL,
    election_id integer NOT NULL,
    polling_unit_id integer NOT NULL,
    agent_id integer NOT NULL
);


--
-- Name: agent_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_assignments_id_seq OWNED BY public.agent_assignments.id;


--
-- Name: agent_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_invitations (
    id integer NOT NULL,
    agent_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: agent_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_invitations_id_seq OWNED BY public.agent_invitations.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action character varying(50) NOT NULL,
    table_name character varying(100) NOT NULL,
    record_id integer NOT NULL,
    old_data json,
    new_data json,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: elections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.elections (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    election_date timestamp with time zone NOT NULL,
    state character varying(100) NOT NULL
);


--
-- Name: elections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.elections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: elections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.elections_id_seq OWNED BY public.elections.id;


--
-- Name: party_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_results (
    id integer NOT NULL,
    submission_id integer NOT NULL,
    party character varying(100) NOT NULL,
    votes integer NOT NULL,
    CONSTRAINT ck_party_votes_nonnegative CHECK ((votes >= 0))
);


--
-- Name: party_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.party_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: party_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.party_results_id_seq OWNED BY public.party_results.id;


--
-- Name: polling_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.polling_units (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    state character varying(100) NOT NULL,
    lga character varying(100) NOT NULL,
    ward character varying(100) NOT NULL
);


--
-- Name: polling_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.polling_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: polling_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.polling_units_id_seq OWNED BY public.polling_units.id;


--
-- Name: result_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.result_evidence (
    id integer NOT NULL,
    submission_id integer NOT NULL,
    file_path character varying(500) NOT NULL,
    uploaded_at timestamp with time zone NOT NULL
);


--
-- Name: result_evidence_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.result_evidence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: result_evidence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.result_evidence_id_seq OWNED BY public.result_evidence.id;


--
-- Name: result_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.result_submissions (
    id integer NOT NULL,
    election_id integer NOT NULL,
    polling_unit_id integer NOT NULL,
    agent_id integer NOT NULL,
    accredited_voters integer NOT NULL,
    valid_votes integer NOT NULL,
    rejected_votes integer NOT NULL,
    version integer NOT NULL,
    is_flagged boolean NOT NULL,
    submitted_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_accredited_nonnegative CHECK ((accredited_voters >= 0)),
    CONSTRAINT ck_rejected_nonnegative CHECK ((rejected_votes >= 0)),
    CONSTRAINT ck_valid_nonnegative CHECK ((valid_votes >= 0))
);


--
-- Name: result_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.result_submissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: result_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.result_submissions_id_seq OWNED BY public.result_submissions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    full_name character varying(150) NOT NULL,
    email character varying(255) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    role character varying(30) NOT NULL,
    is_active boolean NOT NULL,
    phone_number character varying(20)
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wards (
    id integer NOT NULL,
    state character varying(100) NOT NULL,
    lga character varying(100) NOT NULL,
    name character varying(100) NOT NULL,
    ward_number integer NOT NULL
);


--
-- Name: wards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wards_id_seq OWNED BY public.wards.id;


--
-- Name: agent_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments ALTER COLUMN id SET DEFAULT nextval('public.agent_assignments_id_seq'::regclass);


--
-- Name: agent_invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invitations ALTER COLUMN id SET DEFAULT nextval('public.agent_invitations_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: elections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.elections ALTER COLUMN id SET DEFAULT nextval('public.elections_id_seq'::regclass);


--
-- Name: party_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_results ALTER COLUMN id SET DEFAULT nextval('public.party_results_id_seq'::regclass);


--
-- Name: polling_units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_units ALTER COLUMN id SET DEFAULT nextval('public.polling_units_id_seq'::regclass);


--
-- Name: result_evidence id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_evidence ALTER COLUMN id SET DEFAULT nextval('public.result_evidence_id_seq'::regclass);


--
-- Name: result_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_submissions ALTER COLUMN id SET DEFAULT nextval('public.result_submissions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards ALTER COLUMN id SET DEFAULT nextval('public.wards_id_seq'::regclass);


--
-- Name: agent_assignments agent_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_pkey PRIMARY KEY (id);


--
-- Name: agent_invitations agent_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invitations
    ADD CONSTRAINT agent_invitations_pkey PRIMARY KEY (id);


--
-- Name: agent_invitations agent_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invitations
    ADD CONSTRAINT agent_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: elections elections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.elections
    ADD CONSTRAINT elections_pkey PRIMARY KEY (id);


--
-- Name: party_results party_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_results
    ADD CONSTRAINT party_results_pkey PRIMARY KEY (id);


--
-- Name: polling_units polling_units_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_units
    ADD CONSTRAINT polling_units_code_key UNIQUE (code);


--
-- Name: polling_units polling_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polling_units
    ADD CONSTRAINT polling_units_pkey PRIMARY KEY (id);


--
-- Name: result_evidence result_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_evidence
    ADD CONSTRAINT result_evidence_pkey PRIMARY KEY (id);


--
-- Name: result_submissions result_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_submissions
    ADD CONSTRAINT result_submissions_pkey PRIMARY KEY (id);


--
-- Name: agent_assignments uq_agent_election_polling_unit; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT uq_agent_election_polling_unit UNIQUE (election_id, polling_unit_id, agent_id);


--
-- Name: party_results uq_submission_party; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_results
    ADD CONSTRAINT uq_submission_party UNIQUE (submission_id, party);


--
-- Name: users uq_users_phone_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_phone_number UNIQUE (phone_number);


--
-- Name: wards uq_ward_state_lga_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT uq_ward_state_lga_number UNIQUE (state, lga, ward_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wards wards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_pkey PRIMARY KEY (id);


--
-- Name: ix_agent_invitations_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_agent_invitations_agent_id ON public.agent_invitations USING btree (agent_id);


--
-- Name: ix_agent_invitations_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_agent_invitations_id ON public.agent_invitations USING btree (id);


--
-- Name: ix_audit_logs_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_id ON public.audit_logs USING btree (id);


--
-- Name: ix_polling_units_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_polling_units_id ON public.polling_units USING btree (id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_wards_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_wards_id ON public.wards USING btree (id);


--
-- Name: agent_assignments agent_assignments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- Name: agent_assignments agent_assignments_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id);


--
-- Name: agent_assignments agent_assignments_polling_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_assignments
    ADD CONSTRAINT agent_assignments_polling_unit_id_fkey FOREIGN KEY (polling_unit_id) REFERENCES public.polling_units(id);


--
-- Name: agent_invitations agent_invitations_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invitations
    ADD CONSTRAINT agent_invitations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: party_results party_results_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_results
    ADD CONSTRAINT party_results_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.result_submissions(id);


--
-- Name: result_evidence result_evidence_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_evidence
    ADD CONSTRAINT result_evidence_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.result_submissions(id);


--
-- Name: result_submissions result_submissions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_submissions
    ADD CONSTRAINT result_submissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- Name: result_submissions result_submissions_election_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_submissions
    ADD CONSTRAINT result_submissions_election_id_fkey FOREIGN KEY (election_id) REFERENCES public.elections(id);


--
-- Name: result_submissions result_submissions_polling_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.result_submissions
    ADD CONSTRAINT result_submissions_polling_unit_id_fkey FOREIGN KEY (polling_unit_id) REFERENCES public.polling_units(id);


--
-- PostgreSQL database dump complete
--

\unrestrict HNelRdjNc4MMGbxqEtW5gokU5ErTlJmQlbVecItC1vwOLf9E7dWmguUwfueVYB5

