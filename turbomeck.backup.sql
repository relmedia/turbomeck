--
-- PostgreSQL database dump
--

\restrict SMeW2RFToQWaLMappWaqYvFfgP5gsBiIHLE7SyJfttfuvswY6ZOK9cjaPb9yJsI

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

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

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: account; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account (
    user_id text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


ALTER TABLE public.account OWNER TO postgres;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.app_settings OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    parent_id integer,
    name_en text
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categories_id_seq OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: discount_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.discount_codes (
    id integer NOT NULL,
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    min_order_amount numeric(12,2),
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    valid_from timestamp without time zone,
    valid_until timestamp without time zone,
    active text DEFAULT 'true'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.discount_codes OWNER TO postgres;

--
-- Name: discount_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.discount_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.discount_codes_id_seq OWNER TO postgres;

--
-- Name: discount_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.discount_codes_id_seq OWNED BY public.discount_codes.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer,
    product_name text NOT NULL,
    product_image text,
    price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    variant text
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_number text NOT NULL,
    user_id text,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    phone text,
    address text NOT NULL,
    city text NOT NULL,
    postal_code text NOT NULL,
    country text DEFAULT 'SE'::text NOT NULL,
    service_point_name text,
    service_point_id text,
    delivery_option text DEFAULT 'servicepoint'::text,
    subtotal numeric(12,2) NOT NULL,
    shipping_cost numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    total numeric(12,2) NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    stripe_payment_id text,
    post_nord_tracking_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    deposit_amount numeric(10,2),
    balance_due numeric(12,2),
    stripe_balance_payment_id text,
    core_received_at timestamp without time zone
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: page_visits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.page_visits (
    id integer NOT NULL,
    device_type text NOT NULL,
    path text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    browser text
);


ALTER TABLE public.page_visits OWNER TO postgres;

--
-- Name: page_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.page_visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.page_visits_id_seq OWNER TO postgres;

--
-- Name: page_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.page_visits_id_seq OWNED BY public.page_visits.id;


--
-- Name: password_reset_token; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_token (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires timestamp without time zone NOT NULL
);


ALTER TABLE public.password_reset_token OWNER TO postgres;

--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_categories (
    product_id integer NOT NULL,
    category_id integer NOT NULL
);


ALTER TABLE public.product_categories OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name text NOT NULL,
    short_description text,
    description text,
    price numeric(10,2) NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    image text,
    thumbnails jsonb DEFAULT '[]'::jsonb,
    weight numeric(8,2),
    attributes jsonb DEFAULT '[]'::jsonb,
    name_en text,
    short_description_en text,
    description_en text,
    deposit_amount numeric(10,2),
    featured_in_slider integer DEFAULT 0,
    slider_order integer
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    product_id integer NOT NULL,
    user_id text NOT NULL,
    order_id integer,
    rating integer NOT NULL,
    title text,
    comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    edited_at timestamp without time zone
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reviews_id_seq OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    session_token text NOT NULL,
    user_id text NOT NULL,
    expires timestamp without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text,
    email text NOT NULL,
    email_verified timestamp without time zone,
    image text,
    password text,
    role text DEFAULT 'customer'::text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public."user" OWNER TO postgres;

--
-- Name: verification_token; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.verification_token (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp without time zone NOT NULL
);


ALTER TABLE public.verification_token OWNER TO postgres;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: discount_codes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_codes ALTER COLUMN id SET DEFAULT nextval('public.discount_codes_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: page_visits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_visits ALTER COLUMN id SET DEFAULT nextval('public.page_visits_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: postgres
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
\.


--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account (user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) FROM stdin;
359a7242-844f-45fe-a0fe-c499c1c85ba3	oidc	google	101153540457880092918	\N	ya29.a0ATkoCc4wrCsFtDSbobhM1YV6Dsmxsfk3_jV1Cp8UKhX7bWWi_MzEah1-Zs5O1Yuj7gfrR7MQFFxV-nSTW4OTDEX3I8gBE9Q_IDiW9YqTnsi3I7thSa_jw-ev66NhANcaTGUkyAA__qKRtbhQJ4WpTc02hkId4EZFvY28QKarlOPVS2R1Dvaib5bTi41aJFSSMX1BB-waCgYKAVMSARISFQHGX2Michl-lCelMuUKVSdCQ4ckCw0206	1773001432	bearer	https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid	eyJhbGciOiJSUzI1NiIsImtpZCI6IjUzMDcyNGQ0OTE3M2EzZWQ2YjRhMDBhYTYzNDQyMDMwMGQ3MmFlNWIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI1NzU3MTg3MTQzNS1wN3NzYWhwM3EzMjNvam11ZDFyNTMzaWY0aGNmZTcybC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsImF1ZCI6IjU3NTcxODcxNDM1LXA3c3NhaHAzcTMyM29qbXVkMXI1MzNpZjRoY2ZlNzJsLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwic3ViIjoiMTAxMTUzNTQwNDU3ODgwMDkyOTE4IiwiZW1haWwiOiJvbGJlcmcuYXJpZWxAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF0X2hhc2giOiI0bnFfQmtzVlZGWlRJNmMzU2stSmZnIiwibmFtZSI6IkFyaWVsIMOYbGJlcmciLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSjRsMmRXcmJ0T2lwMDl5Mm9tcFROWmI3UDFDZ2VUZVRjY2VyWWNMNElMTFRRYjZRPXM5Ni1jIiwiZ2l2ZW5fbmFtZSI6IkFyaWVsIiwiZmFtaWx5X25hbWUiOiLDmGxiZXJnIiwiaWF0IjoxNzcyOTk3ODM0LCJleHAiOjE3NzMwMDE0MzR9.oUEW3zg4lAEr6m8edcj9WQEvO1NEAmOmkBFU1QwD8AHnTdM-akGwCng_E51nKchvl_VdnrYAGE0h-BkvVJBFymz0oAAviY9akXzpZF5YE6FAwvjcqPipsOJh8Pr4p_WZRPBO_qwjz9B17BN1clZyUYtR_bDy5tQvkfnWqlHni86o5mtN1eXPApNlYgSZG_yoVVpAkcnFwIWn3hm_v9c0N0UCsFfQ8DbCSKB66HeEozLxMRwO6f92SOpTAqvAHRQXFAcQqZbq1L7RVIGxX8YTOr-4zMeLvjoQB_rhaCt_WRL-1XqRPiRjAq2YrlT9-9hGikv72Xng7lvrILj8AWLLng	\N
\.


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_settings (key, value, updated_at) FROM stdin;
mail	{"host":"smtp.turbomeck.se","port":465,"secure":true,"user":"shop@turbomeck.se","password":"Turbomeck11","from":"shop@turbomeck.se"}	2026-03-09 20:00:01.828
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, description, created_at, parent_id, name_en) FROM stdin;
3	Saab 9-3	\N	2026-02-22 23:01:31.194952	2	\N
4	Saab 9-5	\N	2026-02-22 23:13:42.598768	2	\N
5	Saab 900	\N	2026-02-22 23:14:19.585475	2	\N
6	Saab 9000	\N	2026-02-22 23:14:33.597343	2	\N
2	Saab	\N	2026-02-22 23:00:04.347969	\N	\N
7	Volvo	\N	2026-02-22 23:44:51.225455	\N	\N
8	Turbo	\N	2026-02-22 23:45:06.361865	\N	\N
22	Volvo 740	\N	2026-02-25 15:01:48.263571	7	\N
23	Volvo 850	\N	2026-02-25 15:02:17.824089	7	\N
24	Volvo 940	\N	2026-02-25 15:02:31.15026	7	\N
25	Volvo s60	\N	2026-02-25 15:02:42.66118	7	\N
26	Volvo v40	\N	2026-02-25 15:02:54.992096	7	\N
27	Volvo v70	\N	2026-02-25 15:03:04.981761	7	\N
29	Kompressorhus	\N	2026-02-25 15:03:54.650749	8	\N
30	Renoveringssatser	\N	2026-02-25 15:04:03.96256	8	\N
31	Rotorenheter	\N	2026-02-25 15:04:14.050522	8	\N
32	Rotorer (Core)	\N	2026-02-25 15:04:24.032885	8	\N
33	Turbinaxlar	\N	2026-02-25 15:04:34.379334	8	\N
34	Turbinhus	\N	2026-02-25 15:04:43.969607	8	\N
28	Kompressorhjul	\N	2026-02-25 15:03:40.419072	8	Compressor wheel
41	Alla Produkter	Root category	2026-03-19 23:01:03.712339	\N	All Products
\.


--
-- Data for Name: discount_codes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.discount_codes (id, code, discount_type, discount_value, min_order_amount, max_uses, used_count, valid_from, valid_until, active, created_at) FROM stdin;
1	TURBOMECK	percent	20.00	\N	\N	0	\N	\N	true	2026-02-26 21:30:24.025659
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, product_id, product_name, product_image, price, quantity, variant) FROM stdin;
1	1	40	22T TD04HL SAAB 93/5	http://localhost:3001/uploads/product-1771799499852-98696625.png	9495.00	1	\N
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, order_number, user_id, email, first_name, last_name, phone, address, city, postal_code, country, service_point_name, service_point_id, delivery_option, subtotal, shipping_cost, discount, total, status, stripe_payment_id, post_nord_tracking_id, created_at, deposit_amount, balance_due, stripe_balance_payment_id, core_received_at) FROM stdin;
1	TM-2026-0001	faf9859a661017b57b32b75775e822f4	olberg.ariel@gmail.com	Ariel	Ølberg	+4792926666	Hauagata 17	Sandnes	4307	NO	Extra Sandnes	3806098	servicepoint	9495.00	810.00	0.00	10305.00	confirmed	\N	null	2026-02-26 20:58:31.256348	\N	\N	\N	\N
\.


--
-- Data for Name: page_visits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.page_visits (id, device_type, path, created_at, browser) FROM stdin;
1	desktop	/	2026-03-13 13:44:29.985163	\N
2	desktop	/	2026-03-13 14:13:57.912788	chrome
3	desktop	/	2026-03-13 14:14:05.109709	chrome
4	desktop	\N	2026-03-13 15:26:47.05374	other
5	desktop	/products	2026-03-19 19:16:59.197511	chrome
\.


--
-- Data for Name: password_reset_token; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_token (id, user_id, token, expires) FROM stdin;
\.


--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_categories (product_id, category_id) FROM stdin;
79	2
79	4
91	7
91	26
40	2
40	3
40	4
83	2
83	6
49	8
87	7
87	27
87	25
60	7
48	8
48	7
74	8
74	28
43	2
43	3
43	4
62	8
62	31
86	7
86	23
86	27
86	25
64	8
50	4
50	8
82	24
67	7
67	24
44	7
44	8
80	2
80	3
66	7
66	23
66	27
88	2
88	4
53	8
66	25
89	2
89	3
55	7
55	26
55	8
59	8
59	32
61	8
61	7
65	8
65	7
65	24
65	22
69	3
69	8
78	2
81	7
68	7
68	24
81	24
7	3
7	8
47	8
47	30
45	7
45	8
76	8
76	28
45	22
45	24
52	8
52	29
75	28
90	7
90	24
77	28
46	3
46	8
63	31
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, name, short_description, description, price, stock, created_at, updated_at, image, thumbnails, weight, attributes, name_en, short_description_en, description_en, deposit_amount, featured_in_slider, slider_order) FROM stdin;
85	Fläns i rostfritt till TD04-K24	Fläns i rostfritt till TD04-K24 Tjocklek 8mm	<p>Fläns i rostfritt till TD04-K24 </p><ul><li><p>Tjocklek 8mm</p></li></ul><p></p>	400.00	999	2026-03-01 19:18:04.296784	2026-03-17 20:33:26.146	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-85-0-mmotgwz9lqn9z0.png	[]	\N	[]	\N	\N	\N	\N	0	\N
58	TD04HL-22t Kompressorhjul	48,5x61 Extended tip 64 mm	48,5x61 Extended tip 64 mm	995.00	999	2026-03-01 19:17:15.037894	2026-03-17 20:32:23.998	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-58-0-mmotg1uj6h3efr.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
105	Bensinpump Racing	Bosch 044 bästsäljare när det gäller racingpumpar. Ger 4,4 liter per minut stabilt vid 3 bar tryck Stabil till över 7 bar	<p>Bosch 044 bästsäljare när det gäller racingpumpar. Ger 4,4 liter per minut stabilt vid 3 bar tryck Stabil till över 7 bar</p>	2295.00	999	2026-03-01 19:18:41.198214	2026-03-17 21:28:14.44	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-105-0-mmoth5ixcv3xmy.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-105-1-mmoth5vlky9b7x.png"]	\N	[]	\N	\N	<p></p>	\N	0	\N
40	22T TD04HL SAAB 93/5	22T TD04HL SAAB 93/5 byggd på nya delar. Race axel 9 blad Kompressorhjul 58,5×61 Turbinhus Volvos vinklade med T25 fläns	<p>22T TD04HL SAAB 93/5 byggd på nya delar. Race axel 9 blad Kompressorhjul 58,5×61 Turbinhus Volvos vinklade med T25 fläns</p>	9495.00	5	2026-02-22 22:30:29.546393	2026-03-17 21:45:44.933	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-40-0-mmotgq8gac0hds.png	[]	7.00	[]	\N	\N	<p></p>	\N	1	6
51	Dumpventil TD04 aftermarket	Dumpventil TD04 aftermarket eftermarknads dumpventil som passar till TD04 serien.	<p>Dumpventil TD04 aftermarket eftermarknads dumpventil som passar till TD04 serien.</p>	395.00	999	2026-03-01 19:17:03.198359	2026-03-17 20:33:27.106	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-51-0-mmotfrbtys6vu6.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-51-1-mmotfrnf2h7634.png"]	1.00	[]	\N	\N	\N	\N	0	\N
50	Garrett GT1752 SAAB 95-3	Garrett GT1752 SAAB 95-3	<p>Garrett GT1752 SAAB 95-3</p>	2995.00	999	2026-03-01 19:17:01.516705	2026-03-13 11:30:53.804	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-50-0-mmotfpgknp39ln.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-50-1-mmotfpukv2fo4h.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-50-2-mmotfq97y9hfxb.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-50-3-mmotfqpke6u2d0.png"]	\N	[]	\N	\N	\N	\N	0	\N
56	Axel K26 senaste modell			1495.00	999	2026-03-01 19:17:11.726988	2026-03-13 11:31:05.601	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-56-0-mmotfyyfa3wnmh.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-56-1-mmotfzbqri1jcb.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-56-2-mmotg0207uikwh.png"]	1.00	[]	\N	\N	\N	\N	0	\N
82	Intercooler Volo 940 utan AC	Modellanpassad intercooler till Volvo 940 utan AC. Passar Även 240/740. Fraktkostnad 215:- Tjocklek på cellpaketet: 60mm Gjutna gavlar	Modellanpassad intercooler till Volvo 940 utan AC. Passar Även 240/740. Fraktkostnad 215:- Tjocklek på cellpaketet: 60mm Gjutna gavlar	2795.00	999	2026-03-01 19:17:59.360654	2026-03-13 11:31:46.894	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-82-0-mmotgvxyoodyri.png	[]	5.00	[]	\N	\N	\N	\N	0	\N
98	Walbro -GSS341	WALBRO GSS341 Bränsle Pump 255 LPH Pumpen klarar av ca500-550hk	<p>WALBRO GSS341 Bränsle Pump 255 LPH. Pumpen klarar av ca 500-550hk bensin.</p><ul><li><p>Diameter: 39mm</p></li><li><p>Totallängd: 125m</p></li><li><p>Anslutning för Filter: 11mm</p></li></ul><p></p>	995.00	999	2026-03-01 19:18:29.181314	2026-03-17 21:27:34.561	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-98-0-mmoth1x553w5cg.png	[]	\N	[]	\N	\N	\N	\N	0	\N
74	Kompressorhjul TD04-19T	Kompressorhjul TD04-19T 48×46	<p>Kompressorhjul TD04-19T </p><ul><li><p>48×46</p></li></ul><p></p>	625.00	999	2026-03-01 19:17:44.944554	2026-03-13 11:31:43.298	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-74-0-mmotgt6q4vbyro.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
95	Bränsletrycksregulator Linjär 1:1	Linjär justerbar bränsletryckregulator För insprutning och turboladdning ers. standard. 1:1, dvs ger linjärt bränsletryck som följer trycket i insugningsröret.	Linjär justerbar bränsletryckregulator För insprutning och turboladdning ers. standard. 1:1, dvs ger linjärt bränsletryck som följer trycket i insugningsröret.	995.00	999	2026-03-01 19:18:21.843183	2026-03-17 21:39:33.304	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-95-0-mmoth0tdyxjal4.png	[]	\N	[]	\N	\N	\N	\N	0	\N
86	DownPipe Volvo 850-V70-S60 vinklat turbinhus	DownPipe Volvo 850-V70-S60 vinklat turbinhus. Downpipe 3″ Svensktillverkad i rostfritt Racekat 100 Cpi SBF godtjänd	<p>DownPipe Volvo 850-V70-S60 med vinklat turbinhus. </p><ul><li><p>Downpipe 3″ </p></li><li><p>Svensktillverkad i rostfritt </p></li><li><p>Racekat 100 Cpi SBF godtjänd</p></li></ul><p></p>	5995.00	999	2026-03-01 19:18:05.840877	2026-03-13 11:31:48.684	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-86-0-mmotgxbiozoj6x.png	[]	\N	[]	\N	\N	\N	\N	0	\N
54	Dumpventil TD04 original	Dumpventil TD04 original	<p>Dumpventil TD04 original</p>	995.00	999	2026-03-01 19:17:08.296949	2026-03-13 11:31:00.055	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-54-0-mmotfvf89x7r2i.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-54-1-mmotfvrfh3r1xr.png"]	1.00	[]	\N	\N	\N	\N	0	\N
77	19T Kompressorhjul Billet special 5×5 vingar	19T Kompressorhjul Billet special 5×5 vingar 35g (org 40g) 5×5 ”vingar” Få ut det det mesta om du vill uppgradera Tunnare kärna och effektivare	19T Kompressorhjul Billet special 5×5 vingar 35g (org 40g) 5×5 ”vingar” Få ut det det mesta om du vill uppgradera Tunnare kärna och effektivare	895.00	999	2026-03-01 19:17:50.31186	2026-03-13 11:31:44.568	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-77-0-mmotgu4d0w645p.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
73	Avgastempmätare	Vi har valt att bygga en ”ultimat” avgastempmätare för drifting- och bankörning. Inga onödiga knappar	Vi har valt att bygga en ”ultimat” avgastempmätare för drifting- och bankörning. Inga onödiga knappar, varningsfunktioner, röktonade glas eller pipljud. Vi har valt ett repsäkert glas med kraftig led-belyst tavla. Dvs en mätare du kan avläsa i alla väder och situationer.	1095.00	999	2026-03-01 19:17:43.172062	2026-03-13 11:31:42.876	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-73-0-mmotgsqior5gb1.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
52	Kompressorhus TD04HL-19T		<p>Kompressorhus TD04HL-19T.</p>	1495.00	999	2026-03-01 19:17:04.850019	2026-03-13 11:30:55.825	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-52-0-mmotfs545wee8d.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-52-1-mmotfshqvfrzqd.png"]	5.00	[]	\N	\N	\N	\N	0	\N
79	Saab 9-5 Intercooler	I LAGER Saab 9-5 Intercooler modellanpassad. Modell: 9-5 Tjocklek: 45mm Matrial: Helt i aluminium	I LAGER Saab 9-5 Intercooler modellanpassad. Modell: 9-5 Tjocklek: 45mm Matrial: Helt i aluminium	2695.00	999	2026-03-01 19:17:53.87732	2026-03-13 11:31:45.369	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-79-0-mmotgutdmcoido.png	[]	10.00	[]	\N	\N	\N	\N	0	\N
90	Downpipe 3" till Volvo 940 Turbo	3″ downpipe till Volvo 940 turbo med anslutningskona eller fläns för orginal turbo.	<p>3″Downpipe till Volvo 940 turbo med anslutningskona eller fläns för orginal turbo Tillverkad av 3″ rostfritt material.</p>	1225.00	999	2026-03-01 19:18:12.922602	2026-03-13 11:38:37.449	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-1773401714512-528888996.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-1773401731722-354486131.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-1773401754359-129693939.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-1773401913588-482629910.png"]	\N	[]	\N	\N	<p></p>	\N	0	\N
43	Wastegate Saab AERO 93 ,95	Passar Saab 93 -00-02, 95 -98-10	<p>Passar Saab 93 -00-02, 95 -98-10</p>	995.00	999	2026-03-01 19:16:49.693026	2026-03-13 11:30:29.455	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-43-0-mmotf6sxro10u4.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-43-1-mmotf74xuvz3v1.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-43-2-mmotf7iatwcvi1.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-43-3-mmotf7udl3ikbp.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-43-4-mmotf86hsidfzh.png"]	0.50	[]	\N	\N	\N	\N	0	\N
47	Renoverings sats TD04HL	Passar även 13G , 13C , 15G	Passar även 13G , 13C , 15G	995.00	999	2026-03-01 19:16:56.136765	2026-03-13 11:30:46.467	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-47-0-mmotfkyrz2atlj.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-47-1-mmotflbrxvtq26.png"]	\N	[]	\N	\N	\N	\N	0	\N
48	TD04HL storlek 7 original Vinklat Volvo	TD04HL storlek 7 original Vinklat Volvo	<p>TD04HL storlek 7 original Vinklat Volvo.</p>	2795.00	999	2026-03-01 19:16:57.873353	2026-03-13 11:30:47.884	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-48-0-mmotflp8f0qwi4.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-48-1-mmotfm34hmqllh.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-48-2-mmotfmf69mxbkq.png"]	7.00	[]	\N	\N	\N	\N	0	\N
57	Wastegate 19T Original	Wastegate 19T original har hårdare fjäder än dom andra tryckklockorna dessutom så mattas dom med tiden . Kan även hämtas på plats. Frakt 65:- Swish 0709165006 Mvh Ulf	Wastegate 19T original har hårdare fjäder än dom andra tryckklockorna dessutom så mattas dom med tiden . Kan även hämtas på plats. Frakt 65:- Swish 0709165006 Mvh Ulf	1250.00	999	2026-03-01 19:17:13.379567	2026-03-13 11:31:07.445	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-57-0-mmotg0g4l3r8fn.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-57-1-mmotg0z9nac30t.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-57-2-mmotg1ix48p2u4.png"]	1.00	[]	\N	\N	\N	\N	0	\N
55	Volvo S/V 40 2,0T  -98-03	Fabriksny turbo , passar Volvo S/V 40 98-03 OBS!! Utbytes	<p>Fabriksny turbo , passar Volvo S/V 40 98-03.</p>	6250.00	999	2026-03-01 19:17:10.036039	2026-03-13 11:31:03.668	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-0-mmotfw6b3snb65.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-1-mmotfwjvaxgfd2.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-2-mmotfwzoxyici9.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-3-mmotfxeumu4bc8.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-4-mmotfxtp7es18l.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-5-mmotfy5xfkazlw.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-55-6-mmotfyloczxl72.png"]	7.00	[]	\N	\N	\N	\N	0	\N
59	TD04HL-22T Rotorenhet	TD04HL-22T Rotorenhet uppgraderad med raceaxel 9 blad	<p>TD04HL-22T Rotorenhet uppgraderad med raceaxel 9 blad.</p><ul><li><p>Raceaxel 10g lättare</p></li><li><p>Billethjul 48,5 x 61 mm</p></li><li><p>Snabbare spolup lägre avgasmotryck = mera effekt 🙂</p></li></ul><p></p>	4495.00	999	2026-03-01 19:17:16.614873	2026-03-13 11:31:09.887	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-59-0-mmotg269nitbqb.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-59-1-mmotg2opxdtn0m.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-59-2-mmotg30ih23naf.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-59-3-mmotg3cp69kuh9.png"]	1.00	[]	\N	\N	\N	\N	0	\N
65	TD04HL-19T vinklat turbinhus	TD04HL-19T vinklat turbinhus anpassad för Volvo 940/740	TD04HL-19T vinklat turbinhus anpassad för Volvo 940/740 Passar på grenröret till 100% 75 mm utgång från turbinhuset Laddtrycket inställd på cirka 1,0 Bar OBS! utbytesturbo Vilket innebär att vi skickar ut en turbo som både kan vara en ny eller renoverad av oss. Sedan skall gamla turbon (stommen) komma in till oss inom två veckor.	7495.00	999	2026-03-01 19:17:27.553291	2026-03-13 11:31:32.324	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-65-0-mmotgizkdw7av0.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-65-1-mmotgjbh8sknjh.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-65-2-mmotgjonru0y7k.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-65-3-mmotgk6dorpqax.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-65-4-mmotgko215coy0.png"]	7.00	[]	\N	\N	\N	\N	0	\N
76	Kompressorhjul TD04-16T	Kompressorhjul TD04-16T 46×43.4	Kompressorhjul TD04-16T 46×43.4	625.00	999	2026-03-01 19:17:48.474229	2026-03-13 11:31:44.084	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-76-0-mmotgttoz0juw2.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
84	Fläns vinklat turbinhus TD04-K24	Fläns vinklat turbinhus TD04-K24. Passar till vinklat turbinhus TD04 och K24. 8mm tjock	Fläns vinklat turbinhus TD04-K24. Passar till vinklat turbinhus TD04 och K24. 8mm tjock	300.00	999	2026-03-01 19:18:02.675395	2026-03-13 11:31:47.798	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-84-0-mmotgwni45i698.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
104	Wastegate 0.6-2 Bar	Wastegate som man kan byta fjäder i Vridas i 6 olik lägen Gängad stång M6	Wastegate som man kan byta fjäder i Vridas i 6 olik lägen Gängad stång M6	995.00	999	2026-03-01 19:18:39.453704	2026-03-17 21:38:41.687	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-104-0-mmoth4r8lb3xpv.png?v=1773783518389	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-104-1-mmoth55op13zp8.png"]	0.50	[]	\N	\N	\N	\N	0	\N
80	RKY Intercooler Saab 900/9-3	RKY Intercooler Saab 900/9-3. Laddluftskylare (intercooler) från RKY Cooling	RKY Intercooler Saab 900/9-3. Laddluftskylare (intercooler) från RKY Cooling. Endast material av högsta kvalitet har använts vid tillverkningen. Designad med syfte att passa direkt på en Saab 900/9-3 utan att behöva svetsa, kapa och smutsa ner sig alltför mycket. Resultatet blev så bra att konkurrenterna försökt att kopiera den! Här har du originalet. Fraktkostnad 215:-	1995.00	999	2026-03-01 19:17:55.746194	2026-03-13 11:31:45.908	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-80-0-mmotgv3yg0s7u7.png	[]	4.00	[]	\N	\N	\N	\N	0	\N
44	TD04HL-19T Volvo 2003-2008  2,5T	Passar modeller 03-08 med motor 2,5T 7# turbinhus	<p>Passar modeller 03-08 med motor 2,5T 7# turbinhus.</p>	7495.00	999	2026-03-01 19:16:51.331624	2026-03-13 11:30:37.36	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-0-mmotf8kkp9ii8z.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-1-mmotf8xcmg2fjz.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-2-mmotf9ewmkt1eu.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-3-mmotf9s9ojepm7.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-4-mmotfadm5h7m3n.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-5-mmotfas3n3ru27.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-6-mmotfb74z4rjft.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-7-mmotfbomkue30x.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-8-mmotfc1x275b62.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-9-mmotfcgyllxax0.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-10-mmotfcukdyweht.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-11-mmotfdcae88bo1.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-12-mmotfdw5gpwqps.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-44-13-mmotfe7raeo7qm.png"]	7.00	[]	\N	\N	\N	\N	0	\N
78	Saab Aero 2006 Insugningsrör	Saab Aero 2006 Insugningsrör. Från 95 Aero 2006 modell. Ingår modifiering om du tex har en 19T. Skriv vilken turbo den ska passa till. Passar alla Saabar som har GT17 eller TD04-15T aggregat, om anslutningen på turbon kortas 15mm.	Saab Aero 2006 Insugningsrör. Från 95 Aero 2006 modell. Ingår modifiering om du tex har en 19T. Skriv vilken turbo den ska passa till. Passar alla Saabar som har GT17 eller TD04-15T aggregat, om anslutningen på turbon kortas 15mm.	1595.00	999	2026-03-01 19:17:51.93851	2026-03-13 11:31:44.988	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-78-0-mmotguhedg4rlg.png	[]	7.00	[]	\N	\N	\N	\N	0	\N
81	Intercooler Volvo 940 med AC	Modellanpassad Intercooler till Volvo 940 med AC. Passar Även 240/740	<p>Modellanpassad Intercooler till Volvo 940 med AC. Passar Även 240/740. Tjocklek på cellpaketet: 60mm Gjutna gavlar</p>	2795.00	999	2026-03-01 19:17:57.752134	2026-03-13 11:31:46.438	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-81-0-mmotgvj97uj35g.png	[]	5.00	[]	\N	\N	\N	\N	0	\N
83	Intercooler Saab 9000	Äntligen i lager :-) Intercooler Saab 9000. När denna designades gjordes det med syfte att den skulle passa direkt på en Saab 9000	Äntligen i lager :-) Intercooler Saab 9000. När denna designades gjordes det med syfte att den skulle passa direkt på en Saab 9000 viss justering av styrpinnarna krävs. Resultatet, en högpresterande intercooler till lågt pris. Swish 0709165006 Frakt 215:- Material: helt i aluminium Årsmodell: 89-98 Tjocklek: 50mm	1995.00	999	2026-03-01 19:18:01.010977	2026-03-13 11:31:47.37	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-83-0-mmotgwau5usinq.png	[]	5.00	[]	\N	\N	\N	\N	0	\N
42	Adapter fläns från rak till kona	Total tjocklek inkl konan: 18mm , 60 mm hål , pinnbultarna behöver inte monteras lös.	<p>Total tjocklek inkl konan: 18mm , 60 mm hål , pinnbultarna behöver inte monteras lös Denna flänsen används om man ex monterar volvo v70 turbo med rakt avgashus på volvo 940turbo då kan man montera dennna adapter imellan utan att behöva göra om avgasystemet Vikt 650g.</p>	495.00	999	2026-03-01 19:16:47.751392	2026-03-13 11:30:27.164	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-42-0-mmotf5hsu09xxr.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-42-1-mmotf5z807og8l.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-42-2-mmotf6b6c9hctv.png"]	1.00	[]	\N	\N	\N	\N	0	\N
53	TD04HL-19 eller 20T	TD04HL-19 eller 20T Raceaxel 9 blad (original 12blad) 10G lättare , sänker avgasmottrycket med 7%	<p>TD04HL-19 eller 20T Raceaxel 9 blad (original 12blad) 10G lättare , sänker avgasmottrycket med 7% , med portning 10% . Kompressorhjul 19T 5+5 vingar 58x46 mm, 20T 7+0 vingar 58x47 mm Turbinhus "7" storlek , kommer från Volvo men modifierad med T25 fläns 75 mm anslutning mot Dp (original 55 mm) Fläns och packningar ingår .</p>	7995.00	999	2026-03-01 19:17:06.589203	2026-03-13 11:30:59.064	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-53-0-mmotfswntlsyy1.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-53-1-mmotftasd4rmpx.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-53-2-mmotftpv4bm1kr.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-53-3-mmotfu2y4qpit1.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-53-4-mmotful7k40afv.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-53-5-mmotfuytdasquz.png"]	7.00	[]	\N	\N	\N	\N	0	\N
71	Lambdamätare	Lambdamätare 2″ (52mm). Polerad kant i aluminium smokelins och ”led-reverse” belysning Kopplas till befintlig 0-1V lambdasond. Har du ej sond original går det såklart utmärkt att eftermontera.	Lambdamätare 2″ (52mm). Polerad kant i aluminium smokelins och ”led-reverse” belysning Kopplas till befintlig 0-1V lambdasond. Har du ej sond original går det såklart utmärkt att eftermontera.	549.00	999	2026-03-01 19:17:39.804787	2026-03-13 11:31:41.889	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-71-0-mmotgs3i5o8fwx.png	[]	0.20	[]	\N	\N	\N	\N	0	\N
72	Laddtrycksmätare AUTOGAGE	Laddtrycksmätare AUTOGAGE för enkel avläsning. Perfekt till dig som kör bana eller söker ett cleant alternativ. Levereras komplett med Instruktioner på engelska. Regulerat t-kors Vakuumslang (1,8m) och glödlampa till belysningen. Kablage till belysning medföljer ej. Du ansluter direkt på sockeln med kabelskor, se bild på bakstycket. Belysningen består av en styck T5 glödlampa som lyser upp mätartavlan.	Laddtrycksmätare AUTOGAGE för enkel avläsning. Perfekt till dig som kör bana eller söker ett cleant alternativ. Levereras komplett med Instruktioner på engelska. Regulerat t-kors Vakuumslang (1,8m) och glödlampa till belysningen. Kablage till belysning medföljer ej. Du ansluter direkt på sockeln med kabelskor, se bild på bakstycket. Belysningen består av en styck T5 glödlampa som lyser upp mätartavlan.	195.00	999	2026-03-01 19:17:41.466251	2026-03-13 11:31:42.29	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-72-0-mmotgsf5ygf9h1.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
87	Volvo 4-WD Downpipe 100Cpi racekat	Volvo 4-WD Downpipe 100Cpi racekat. Passar till: Volvo V70 S60 -01 - 08	Volvo 4-WD Downpipe 100Cpi racekat. Passar till: Volvo V70 S60 -01 - 08	5995.00	999	2026-03-01 19:18:07.731524	2026-03-13 11:31:49.116	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-87-0-mmotgxnnn40j3a.png	[]	\N	[]	\N	\N	\N	\N	0	\N
46	TD04HL-19T Upgrade	Turbo till Saab 9-3 med V-6 motor turbinhuset portat Billerhjul https://turbomeck.se/19t-kompressorhjul-billet-special-5x5-vingar/ Race axel 10 Gram lättare spolar fortare håller ut längre.	<p>Turbo till Saab 9-3 med V-6 motor turbinhuset portat Billerhjul https://turbomeck.se/19t-kompressorhjul-billet-special-5x5-vingar/ Race axel 10 Gram lättare spolar fortare håller ut längre. OBS utbytes , utan stomme 9495:- Frakten kostar 215:- Swish 0709165006</p>	8495.00	999	2026-03-01 19:16:54.408592	2026-03-13 11:30:45.506	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-0-mmotfhnpa0z0xn.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-1-mmotfi2f16g846.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-2-mmotfifwhgzbu8.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-3-mmotfiuytiz6b9.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-4-mmotfj9jakau2r.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-5-mmotfjsv1dpgru.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-6-mmotfk6gp2wozs.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-46-7-mmotfkkr05ydum.png"]	7.00	[]	\N	\N	\N	\N	0	\N
70	MOBIL 1 5W-50 4L	MOBIL 1 5W-50 4L är den mest avancerade syntetiska motoroljan, framställd för att ge maximalt slitageskydd	MOBIL 1 5W-50 4L är den mest avancerade syntetiska motoroljan, framställd för att ge maximalt slitageskydd och därmed en jämn körning vid alla tillfällen. Mobil 1 5W- 50, Rally Formula, överträffar branschkraven och de krav som biltillverkarna ställer på högpresterande, turboladdade, bränsleinsprutade, bensin- och dieseldrivna motorer.	550.00	999	2026-03-01 19:17:37.988121	2026-03-17 20:33:25.442	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-70-0-mmotgrq9ba7abb.png	[]	\N	[]	\N	\N	\N	\N	0	\N
62	TD04HL-19T uppgraderad	TD04HL-19T uppgraderad rotorenet med raceaxel 9 blad. 10g lättare Billethjul 5+5 vingar 8g	TD04HL-19T uppgraderad rotorenet med raceaxel 9 blad. 10g lättare Billethjul 5+5 vingar 8g lättare Snabbare spolup lägre avgasmotryck = mera effekt :-)	4250.00	999	2026-03-01 19:17:21.892175	2026-03-13 11:31:25.326	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-62-0-mmotgd070gqhlh.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-62-1-mmotgdgylx5hr2.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-62-2-mmotgdwtelj76p.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-62-3-mmotgec8dmi83x.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-62-4-mmotgevph4bjzq.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-62-5-mmotgfbic1iqjr.png"]	0.50	[]	\N	\N	\N	\N	0	\N
102	Lambdamutter rostfri	M18x1,5 13mm hög 24skalle	<p>M18x1,5 13mm hög 24skalle</p>	25.00	999	2026-03-01 19:18:35.864916	2026-03-17 21:33:38.152	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-102-0-mmoth35nbc7f86.png?v=1773783214154	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-102-1-mmoth3i9jsblvn.png"]	0.10	[]	\N	\N	<p></p>	\N	0	\N
67	TD04HL-19T Volvo 940	TD04HL-19T Volvo 940 100% bolt on storlek 7 på turbinhuset wastegaten inställd på 0,8 bar. OBS! utbytesturbo Vilket innebär att vi skickar ut en turbo som både kan vara en ny eller renoverad av oss. Sedan skall gamla turbon (stommen) komma in till oss inom två veckor.	TD04HL-19T Volvo 940 100% bolt on storlek 7 på turbinhuset wastegaten inställd på 0,8 bar. OBS! utbytesturbo Vilket innebär att vi skickar ut en turbo som både kan vara en ny eller renoverad av oss. Sedan skall gamla turbon (stommen) komma in till oss inom två veckor.	7495.00	999	2026-03-01 19:17:31.347126	2026-03-17 21:40:17.844	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-67-0-mmotgm2z3n3tcf.png?v=1773783614966	[]	7.00	[]	\N	\N	\N	\N	1	4
66	TD04HL-19T Original	TD04HL-19T Original passar följande modeller 850 V70 S60 med vinklat turbinhus	TD04HL-19T Original passar följande modeller 850 V70 S60 med vinklat turbinhus	7995.00	999	2026-03-01 19:17:29.507696	2026-03-13 11:31:33.65	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-66-0-mmotgl1shw3pnq.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-66-1-mmotgldwgv6l4y.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-66-2-mmotglpux1rea9.png"]	7.00	[]	\N	\N	\N	\N	0	\N
96	Walbro GST450 – IN TANK	walbro har nu släppt en värstingmodell av In-Tank bränslepump Competition GST450, som även är lämplig för Etanol / E85Walbro	walbro har nu släppt en värstingmodell av In-Tank bränslepump Competition GST450, som även är lämplig för Etanol / E85Walbro GST 450 -InTank- bränslepump	1695.00	999	2026-03-01 19:18:23.346894	2026-03-13 11:31:53.687	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-96-0-mmoth187nbx3ju.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
99	No Name Typ ”Bosch” -044	En högprestanda pump för den som vill leverara mycket bränsle. Mycket populära inom rally och racing.	En högprestanda pump för den som vill leverara mycket bränsle. Mycket populära inom rally och racing. Sitter som orginalpump på Porsches Turbobilar. Kan moteras i tank eller externt. Räcker för 700hk bensin och 500hk med Etanol. 270L / timme vid 3bars bränsletryck	575.00	999	2026-03-01 19:18:30.756088	2026-03-17 21:39:22.306	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-99-0-mmoth285fbmc7g.png?v=1773783560464	[]	0.50	[]	\N	\N	\N	\N	0	\N
92	3″ Downpipe för vinklat turbinhus	3″ Downpipe för vinklat turbinhus. Svensktillverkad i rostfritt 3″Downpipe till Volvo 940 Turbo med vinklad/fläns för turbo med vinklat turbinhus TD04 och K24	3″ Downpipe för vinklat turbinhus. Svensktillverkad i rostfritt 3″Downpipe till Volvo 940 Turbo med vinklad/fläns för turbo med vinklat turbinhus TD04 och K24	1995.00	999	2026-03-01 19:18:16.569026	2026-03-13 11:31:51.83	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-92-0-mmotgyov0cacxv.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-92-1-mmotgz16i8tjsz.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-92-2-mmotgzc3e9ymup.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-92-3-mmotgzqn4c4e05.png"]	10.00	[]	\N	\N	\N	\N	0	\N
93	Bränsletrycksregulator Progressiv 1:1.5	Bränsletrycksregulator Progressiv 1:1.5. Ökar bränsletrycket 1:1.5 när turbon laddar. Progresiv som gör att bränsletrycket ökar mer än trycket i insugningsröret.	Bränsletrycksregulator Progressiv 1:1.5. Ökar bränsletrycket 1:1.5 när turbon laddar. Progresiv som gör att bränsletrycket ökar mer än trycket i insugningsröret.	1195.00	999	2026-03-01 19:18:18.233095	2026-03-13 11:31:52.288	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-93-0-mmoth03zqnrqog.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
101	AEM Bränslepump 320L E85	AEM bränslepump 50-1200 Pumpen är av ”in tank”-typ och flödar 320 liter per timme vid 3 Bar	AEM bränslepump 50-1200 Pumpen är av ”in tank”-typ och flödar 320 liter per timme vid 3 Bar. Storleken är exakt samma som Walbro´s in-line-pumpar och är storleksmässigt en tacksam pump för ”in tank”-montering. Alltså perfekt om du vill byta ut din Walbro-pump mot en kraftigare och vill köra på E85. Monterings kit ingår OBS! Kom ihåg att aldrig torrköra pumpen – då skär den! Kör du på E85 bör pumpen klara närmare 700hk vid 3 bar på en sugmotor, så perfekt för dig som ligger runt 450hk på överladdad maskin på E85.	1795.00	999	2026-03-01 19:18:34.127035	2026-03-13 11:31:55.791	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-101-0-mmoth2uakxpgml.png	[]	0.52	[]	\N	\N	\N	\N	0	\N
106	Wastegate universal	Wastegate universal perfekt på en Volvo 940 LTT Lätt att ändra längden på armen om man vill ha den kortare eller längre	<p>Wastegate universal perfekt på en Volvo 940 LTT Lätt att ändra längden på armen om man vill ha den kortare eller längre standard 0,6-1,2 Bar slaglängd 17mm M6 gänga</p>	625.00	999	2026-03-01 19:18:43.160592	2026-03-17 21:38:01.937	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-1773783476339-571142268.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-106-1-mmoth6n6jxo4n8.png"]	0.50	[]	\N	\N	<p></p>	\N	0	\N
100	Bosch -040/023	En högprestanda pump för den som vill leverara mycket bränsle. Mycket populära inom rally och racing	En högprestanda pump för den som vill leverara mycket bränsle. Mycket populära inom rally och racing. Monteras i tank. Flödar för 5-600 hk.	2295.00	999	2026-03-01 19:18:32.375517	2026-03-17 21:39:06.272	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-100-0-mmoth2ivgtucts.png?v=1773783543245	[]	0.49	[]	\N	\N	\N	\N	0	\N
97	Walbro GSL392	Walbro GSL 392 bensinpump för montering utanför tank. Pumpen flödar 255lph klarar av upp till drygt 500-550hk (bensin)	Walbro GSL 392 bensinpump för montering utanför tank. Pumpen flödar 255lph klarar av upp till drygt 500-550hk (bensin) och ca 400-450hk (E85). Diameter: 39mm Vikt: 370g Levereras utan monteringstillbehör, därav att vi kan hålla ett lågt pris!	1250.00	999	2026-03-01 19:18:27.185616	2026-03-13 11:31:54.2	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-97-0-mmoth1iu7y4cb5.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
94	Bränsletrycksregulator Progressiv	Progressiv justerbar bränsletrycksregulator. Ökar bränsletrycket 1:1,2 när turbon laddar. Progressiv som gör att bränsletrycket ökar	<p>Progressiv justerbar bränsletrycksregulator. Ökar bränsletrycket 1:1,2 när turbon laddar. Progressiv som gör att bränsletrycket ökar mer än trycket i insugningsröret. Kopplas i serie med standard regulator eller ensam med original borttagen. Har 2 stycken membran per fläns.</p>	1375.00	999	2026-03-01 19:18:19.997149	2026-03-13 11:31:52.754	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-94-0-mmoth0g6angmp6.png	[]	0.50	[]	\N	\N	\N	\N	0	\N
45	Volvo K24-k26 anpassad för 940-740	Volvo K24-K26 uppdaterad med K26 delar , Större axel 12 eller 9 vingar 54,2 x 64 Kompressorhjul 50,5 x 70.2 OBS!! utbytes , utan stomme 10995:- Frakt 215:- Swish 0709165006	<p>Volvo K24-K26 uppdaterad med K26 delar , Större axel 12 eller 9 vingar 54,2 x 64 Kompressorhjul 50,5 x 70.2 OBS!! utbytes , utan stomme 10995:- Frakt 215:- Swish 0709165006</p>	8995.00	999	2026-03-01 19:16:52.930034	2026-03-13 11:30:41.221	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-0-mmotfeoi3qjop8.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-1-mmotff6jco1s11.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-2-mmotffl1t7cpi5.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-3-mmotfg089gehxz.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-4-mmotfgei0ksspk.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-5-mmotfgsu716iz2.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-45-6-mmotfh8joy3hvo.png"]	\N	[]	\N	\N	<p></p>	\N	0	\N
88	Down Pipe med Racekat Saab 9-5	Down Pipe med Racekat Saab 9-5. Nya Dp på lager med 100Cpi racekat. Grövre downpipe tillverkad i 3″ rostfritt stål med 100cells ”metallisk” race katalysator (Euro 4). Modellanpassad för enkel montering och katalysatorn klarar besiktning hos Svensk Bilprovning. De har även uttag för både bakre lamdasond samt främre. Ger din Saab en mycket kraftig prestandaförbättring!	Down Pipe med Racekat Saab 9-5. Nya Dp på lager med 100Cpi racekat. Grövre downpipe tillverkad i 3″ rostfritt stål med 100cells ”metallisk” race katalysator (Euro 4). Modellanpassad för enkel montering och katalysatorn klarar besiktning hos Svensk Bilprovning. De har även uttag för både bakre lamdasond samt främre. Ger din Saab en mycket kraftig prestandaförbättring!	4995.00	999	2026-03-01 19:18:09.309488	2026-03-13 11:31:49.548	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-88-0-mmotgxzrws23x7.png	[]	3.00	[]	\N	\N	\N	\N	0	\N
49	TD04HL-19 eller 20T (kopia)	TD04HL-19 eller 20T Raceaxel 9 blad (original 12blad) 10G lättare , sänker avgasmottrycket med 7% , med portning 10% . Kompressorhjul 19T 5+5 vingar 58x46 mm, 20T 7+0 vingar 58x47 mm Turbinhus "7" storlek , kommer från Volvo men modifierad med T25 fläns 75 mm anslutning mot Dp (original 55 mm) Fläns och packningar ingår . OBS!! utbytes , utan returstomme 8995:- Frakt 215:- Swish 0709165006	TD04HL-19 eller 20T Raceaxel 9 blad (original 12blad) 10G lättare , sänker avgasmottrycket med 7% , med portning 10% . Kompressorhjul 19T 5+5 vingar 58x46 mm, 20T 7+0 vingar 58x47 mm Turbinhus "7" storlek , kommer från Volvo men modifierad med T25 fläns 75 mm anslutning mot Dp (original 55 mm) Fläns och packningar ingår . OBS!! utbytes , utan returstomme 8995:- Frakt 215:- Swish 0709165006	7995.00	999	2026-03-01 19:16:59.693804	2026-03-13 11:30:51.339	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-49-0-mmotfms2bgr8ti.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-49-1-mmotfn8cqsk1gc.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-49-2-mmotfnkxsac8d6.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-49-3-mmotfo0x5qefz6.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-49-4-mmotfoi2oh8lle.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-49-5-mmotfoyk2w3c9p.png"]	9.00	[]	\N	\N	\N	\N	0	\N
63	Rotor (Core) 13C-19T Melett	Rotor (Core) 13C-19T	<p>Rotor (Core) 13C-19T Melett Finns i 13C , 13T , 14t , 15t , 15G , 15T , 16t , 18t , 19t.</p><ul><li><p>Enkel att byta själv</p></li><li><p>Packning och O-ring ingår</p></li></ul><p></p>	2495.00	999	2026-03-01 19:17:23.808748	2026-03-13 11:31:26.236	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-63-0-mmotgfnw9f50te.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-63-1-mmotgg0g1hq95s.png"]	1.00	[{"name": "Melett", "options": ["13C"]}, {"name": "Melett", "options": ["13T"]}, {"name": "Melett", "options": ["14T"]}, {"name": "Melett", "options": ["15T"]}, {"name": "Melett", "options": ["15G"]}, {"name": "Melett", "options": ["15T"]}, {"name": "Melett", "options": ["16T"]}, {"name": "Melett", "options": ["18T"]}, {"name": "Melett", "options": ["19T"]}]	\N	\N	\N	\N	0	\N
91	3″ Downpipe S40-V40 FAS 1 & 2	3″ Downpipe S40-V40 FAS 1 & 2. Tillverkad av rostfritt material SIS 2333. Minskar mottrycket och förbättrar flödet	<p>3″ Downpipe S40-V40 FAS 1 &amp; 2. Tillverkad av rostfritt material SIS 2333. Minskar mottrycket och förbättrar flödet, höjer effekt och vridmoment. Turbon kommer snabbare (”spool-up effekt”). Laddtrycket behålls längre. Effekten behålls vid flera accelerationer. Minskar temperaturökning vid belastning. Passar till JT 3″-tums halvsatser.</p>	3495.00	999	2026-03-01 19:18:14.743731	2026-03-13 13:05:48.997	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-1773407146840-25270348.png	[]	10.00	[]	\N	\N	<p></p>	\N	0	\N
64	TD04H-13C original turbo	TD04H-13C original turbo Justerbar wastegate 0,5-1,2 Bar Portat utblås 55-58 mm för bättre flöde	TD04H-13C original turbo Justerbar wastegate 0,5-1,2 Bar Portat utblås 55-58 mm för bättre flöde Kan se ut så här också , om jag inte har några original turbinhus i lager, 60 mm i diameter OBS!! Utbytes, retur stomme skickas inom 2v frakten kostar 215:- Swish 0709165006	4995.00	999	2026-03-01 19:17:25.766285	2026-03-13 11:31:29.649	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-0-mmotggd1pwha7x.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-1-mmotggor2ctvq4.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-2-mmotgh44grhgi7.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-3-mmotghjqcac87v.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-4-mmotghv2z49ikx.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-5-mmotgi869mx2a7.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-64-6-mmotgin2nik4nr.png"]	7.00	[]	\N	\N	\N	\N	0	\N
75	Kompressorhjul TD04-18T	Kompressorhjul TD04-18T 46×45	<p>Kompressorhjul TD04-18T</p><ul><li><p>46×45</p></li></ul><p></p>	625.00	999	2026-03-01 19:17:46.791778	2026-03-13 11:31:43.699	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-75-0-mmotgtigbmy44y.png	[]	0.50	[]	Compressor wheel TD04-18T	Compressor wheel TD04-18T 46×45	<p>Compressor wheel TD04-18T</p><ul><li><p>46×45</p></li></ul><p></p>	\N	0	\N
89	Downpipe med Racekat Saab 9-3 98-03	Downpipe med Racekat Saab 9-3 98-03. Nya Dp på lager med 100Cpi racekat Grövre downpipe tillverkad i 3″ rostfritt stål med 100cells ”metallisk” race katalysator (Euro 4). Modellanpassad för enkel montering och katalysatorn klarar besiktning hos Svensk Bilprovning. De har även uttag för både bakre lamdasond samt främre. Ger din Saab en mycket kraftig prestandaförbättring!	Downpipe med Racekat Saab 9-3 98-03. Nya Dp på lager med 100Cpi racekat Grövre downpipe tillverkad i 3″ rostfritt stål med 100cells ”metallisk” race katalysator (Euro 4). Modellanpassad för enkel montering och katalysatorn klarar besiktning hos Svensk Bilprovning. De har även uttag för både bakre lamdasond samt främre. Ger din Saab en mycket kraftig prestandaförbättring!	4995.00	999	2026-03-01 19:18:11.207603	2026-03-13 11:31:50.009	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-89-0-mmotgybt1uj73q.png	[]	6.00	[]	\N	\N	\N	\N	0	\N
69	22T Volvo 940/740	22T Volvo 940/740 byggd på nya delar	<p>22T Volvo 940/740 byggd på nya delar.</p><ul><li><p>Race axel 9 ”blad”</p></li><li><p>10 gram lättare än original axel 12 blad</p></li><li><p>spolar upp fortare</p></li><li><p>lägre avgasmottryck = mer effekt</p></li><li><p>Biller kompressorhjul&nbsp; 48,5×61 6+6 vingar</p></li><li><p>turbon portad</p></li><li><p>6 eller 7 storlek på turbinhuset , beror på vad jag har i lager.<br>6 turbinhus har 2mm större wastegate hål</p></li></ul><p></p>	8995.00	999	2026-03-01 19:17:36.511562	2026-03-17 21:42:04.798	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-69-0-mmotgqnbqxsh3d.png?v=1773783722637	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-69-1-mmotgqzc0pv903.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-69-2-mmotgrcym4ca2c.png"]	7.00	[]	\N	\N	<p></p>	4000.00	1	5
7	TD04L-19T Saab 9-3 2003-2010	Raceaxel 9 blad (original 12blad)	<p><strong>TD04HL-19</strong></p><ul><li><p>Raceaxel 9 blad (original 12blad)</p></li><li><p>10G lättare</p></li><li><p>Sänker avgasmottrycket med 7%</p></li><li><p>Med 10% portning</p></li><li><p>Kompressorhjul billet 19T 5+5 vingar&nbsp; 58x46 mm</p></li></ul><p></p>	7995.00	5	2026-01-29 22:17:50.088144	2026-03-13 11:30:25.486	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-0-mmotf0ji0srawh.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-1-mmotf12gd0tfa8.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-2-mmotf1imbketw1.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-3-mmotf1zg9oy2it.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-4-mmotf2d9epyvro.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-5-mmotf2q6n1hs08.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-6-mmotf32yx73qci.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-7-mmotf3gwahd8ta.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-8-mmotf3w9cxfgj2.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-9-mmotf48ckr4xm3.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-10-mmotf4o49wq8r2.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-7-11-mmotf53jrt2d3k.png"]	7.00	[]	\N	\N	\N	\N	0	\N
60	Volvo K24-K26 Rotorenhet	Volvo K24-K26 Rotorenhet uppgraderings Core till Volvos K24 Billet hjul och eftermarknads axel som är 83 gram lättare än K26 original Finns även med K26 lagerhus om du inte har en K24 som standard	Volvo K24-K26 Rotorenhet uppgraderings Core till Volvos K24 Billet hjul och eftermarknads axel som är 83 gram lättare än K26 original Finns även med K26 lagerhus om du inte har en K24 som standard	5995.00	999	2026-03-01 19:17:18.392429	2026-03-13 11:31:15.46	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-0-mmotg3qkcs5n1a.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-1-mmotg43fcxuldn.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-2-mmotg4gx3i91d9.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-3-mmotg4tza15dwl.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-4-mmotg58wcvkd0d.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-5-mmotg5vv7y3rfo.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-6-mmotg680v73glz.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-7-mmotg6kdcmypkx.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-8-mmotg6ubtx0mdb.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-9-mmotg786pijx4a.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-60-10-mmotg7lnuos5u6.png"]	1.50	[]	\N	\N	\N	\N	0	\N
61	Volvo K24-K26	Volvo K24-K26 uppdaterad med K26 delar , finns i 2 varianter	<p>Volvo K24-K26 uppdaterad med K26 delar , finns i 2 varianter V-bans och slanganslutning. Större axel 12 eller 9 vingar 54,2 x 64 Kompressorhjul 50,5 x 70.2.</p>	8995.00	999	2026-03-01 19:17:20.119932	2026-03-17 20:33:59.796	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-0-mmotg81nx7xwg7.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-1-mmotg8h3ye7zn8.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-2-mmotg8sp56bd6u.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-3-mmotg97s0iuxxl.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-4-mmotg9n46k617x.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-5-mmotga2bz3pid4.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-6-mmotgahuthivv6.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-7-mmotgaxzig9ybp.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-8-mmotgbc7ryg3gu.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-9-mmotgbs407xi1n.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-10-mmotgc7n2edltt.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-61-11-mmotgcmypz613b.png"]	7.00	[]	\N	\N	\N	\N	0	\N
68	TD04HL-16T Volvo 940	TD04HL-16T Volvo 940 100% bolt on storlek 7 på turbinhuset wastegaten inställd på 0,8 bar	TD04HL-16T Volvo 940 100% bolt on storlek 7 på turbinhuset wastegaten inställd på 0,8 bar. OBS! utbytesturbo: Vilket innebär att vi skickar ut en turbo som både kan vara en ny eller renoverad av oss. Sedan skall gamla turbon (stommen) komma in till oss inom två veckor.	5995.00	999	2026-03-01 19:17:33.164127	2026-03-13 11:31:39.041	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-0-mmotgmgmh4njae.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-1-mmotgmwsq8ad29.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-2-mmotgn9em6sspa.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-3-mmotgnoda3fp4b.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-4-mmotgo2b6hyb5z.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-5-mmotgoh1afld1k.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-6-mmotgp2shdw8pp.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-7-mmotgphw4u5ml1.png", "https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-68-8-mmotgptpf4aygp.png"]	7.00	[]	\N	\N	\N	\N	0	\N
103	Bredbandslambda	Det senaste från Autogauge. Mätaren säljs & ”brandas” även till Amerikanska Prosport som valt att lägga all sin tillverkning	Det senaste från Autogauge. Mätaren säljs & ”brandas” även till Amerikanska Prosport som valt att lägga all sin tillverkning hos Autogauge Taiwan., Det florerar mkt rykten om Prosports bredbandslambda, men det är alltså Autogauge som är först med att använda sig av Bosch´s senaste LSU 4.9-sond och det är Autogauge som tillverkar mätaren – Ingen annan! – Komplett med Bosch LSU 4.9-sond, kablage och lambdamutter -Polerad kant för att matcha våra övriga black crystal- & Black LCD-mätare! Noggrannhet: +/- 0.7% Förbrukning: 1.3 A Mätområde: Lambda 10.0:1 -> 20.0:1 AFR Sensor: Bosch LSU4.9 Mätaren är alltså komplett med sensor och kablage – du måste alltså inte ansluta till någon laptop eller sprut. Om du dock vill logga värdet via sprut eller eller dator bör du välja lambdan från AEM. AEM bredbandslambda finner du här! OBS! Var noga med att läsa igenom manualen före installation! – Sonden måste monteras minst 18″ (45cm) från turbon (har du högre avgastemp än 800grader bör avståndet ökas!) – Sonden måste monteras över horisontellt läge. – Sonden får inte sitta monterad utan spänning från mätaren Sonden kommer vid felaktig montering att sota sönder. Riktvärden: Under last: AFR 12-12,8 (beroende på bil & setup) Utan last: AFR 14,7 (Lambda 1.0)	2250.00	999	2026-03-01 19:18:37.546965	2026-03-13 11:31:57.876	https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-103-0-mmoth3v78evipa.png	["https://pub-fa1eb59700a04d51a5e4cae540171b34.r2.dev/products/product-103-1-mmoth4e3ql2qld.png"]	1.00	[]	\N	\N	\N	\N	0	\N
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reviews (id, product_id, user_id, order_id, rating, title, comment, created_at, edited_at) FROM stdin;
1	40	faf9859a661017b57b32b75775e822f4	1	5	Bästa Turbo	Köpte denna och monterade allt på plats, Sicken grym turbo, drar ifrån alla nu med mina 1000hk under huven. Tack Turbomeck för grym turbo och snabb leverans.	2026-03-05 20:31:42.490484	\N
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (session_token, user_id, expires) FROM stdin;
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."user" (id, name, email, email_verified, image, password, role, metadata, created_at) FROM stdin;
359a7242-844f-45fe-a0fe-c499c1c85ba3	Ariel Olberg	olberg.ariel@gmail.com	2026-03-09 21:50:26.978	https://lh3.googleusercontent.com/a/ACg8ocJ4l2dWrbtOip09y2ompTNZb7P1CgeTeTccerYcL4ILLTQb6Q=s96-c	\N	customer	{"savedAddress": {"city": "Sandnes", "email": "olberg.ariel@gmail.com", "phone": "+4792926666", "address": "Hauagata 17", "country": "NO", "lastName": "Olberg", "firstName": "Ariel", "postalCode": "4307"}, "savedWishlist": []}	2026-03-08 19:23:54.345964
faf9859a661017b57b32b75775e822f4	Ariel Ølberg	ariel@relmedia.no	2026-03-17 20:20:04.966	/uploads/avatars/avatar-faf9859a661017b57b32b75775e822f4-1773094117330.jpg	$2a$10$zRqTOLtlITii2u2Vn1O3wOI23lPq62L69P1VRgo/.FWZVIBxHeGtm	admin	{"savedAddress": {"city": "Sandnes", "email": "olberg.ariel@gmail.com", "phone": "+4792926666", "address": "Hauagata 17", "country": "NO", "lastName": "Ølberg", "firstName": "Ariel", "postalCode": "4307"}, "savedWishlist": []}	2026-02-26 17:05:40.815322
\.


--
-- Data for Name: verification_token; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.verification_token (identifier, token, expires) FROM stdin;
ariel@relmedia.no	4384662f05ba8814db0fbb142ab2b7bc634f525a79956c7d54d38851b29e6312	2026-03-09 22:25:01.763
ariel@relmedia.no	c18df72961f4873ca5c25271d03ba1faae61e9a3052b83a4e2d9c098fa75decd	2026-03-09 22:26:40.391
ariel@relmedia.no	cb81fbaad247f5ddd0ceeae57224c180ae1d8282501114bc1b47a4dc173ea346	2026-03-09 22:27:58.792
ariel@relmedia.no	e7abeeb80292ddb84566644e76563c38605c913a0fe214668df1169838eaf859	2026-03-09 22:33:12.777
ariel@relmedia.no	b17b24f002f76486c40b7ab21dfdfe4d26284976693d71739fdff8b35ab4fdc8	2026-03-09 22:39:44.565
ariel@relmedia.no	8d74eb6915281d8575d8c89b898f0a0d6aab4f52c1f1605a18519ccb1cec3fa6	2026-03-09 22:47:21.614
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: postgres
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 1, false);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 41, true);


--
-- Name: discount_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.discount_codes_id_seq', 1, true);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 2, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 2, true);


--
-- Name: page_visits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.page_visits_id_seq', 5, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_id_seq', 106, true);


--
-- Name: reviews_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reviews_id_seq', 1, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: account account_provider_provider_account_id_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_provider_provider_account_id_pk PRIMARY KEY (provider, provider_account_id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: discount_codes discount_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_code_unique UNIQUE (code);


--
-- Name: discount_codes discount_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: page_visits page_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.page_visits
    ADD CONSTRAINT page_visits_pkey PRIMARY KEY (id);


--
-- Name: password_reset_token password_reset_token_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_product_id_category_id_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_product_id_category_id_pk PRIMARY KEY (product_id, category_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (session_token);


--
-- Name: user user_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: account account_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id);


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: password_reset_token password_reset_token_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_token
    ADD CONSTRAINT password_reset_token_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_category_id_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: session session_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict SMeW2RFToQWaLMappWaqYvFfgP5gsBiIHLE7SyJfttfuvswY6ZOK9cjaPb9yJsI

