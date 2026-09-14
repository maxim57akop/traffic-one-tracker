CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS teams (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    totp_secret TEXT,
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('admin', 'buyer', 'teamlead', 'finance')),
    manager_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_team_role_idx ON users(team_id, role);
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_manager_idx ON users(manager_id);

CREATE TABLE IF NOT EXISTS buyer_groups (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lead_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyer_groups_team_idx ON buyer_groups(team_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES buyer_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_group_idx ON users(group_id);

CREATE TABLE IF NOT EXISTS api_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS campaigns (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    domain_id BIGINT,
    alias TEXT,
    group_name TEXT,
    source_name TEXT,
    flow_rotation TEXT NOT NULL DEFAULT 'position' CHECK (flow_rotation IN ('position', 'weight')),
    cost_model TEXT NOT NULL DEFAULT 'cpc' CHECK (cost_model IN ('cpc', 'cpm')),
    cost_value NUMERIC(12,4) NOT NULL DEFAULT 0,
    cost_currency CHAR(3) NOT NULL DEFAULT 'EUR',
    cost_from_param BOOLEAN NOT NULL DEFAULT true,
    traffic_loss INTEGER NOT NULL DEFAULT 0 CHECK (traffic_loss >= 0 AND traffic_loss <= 100),
    uniqueness TEXT NOT NULL DEFAULT 'ip_ua' CHECK (uniqueness IN ('ip_ua', 'ip', 'parameter')),
    use_cookies BOOLEAN NOT NULL DEFAULT true,
    uniqueness_ttl_hours INTEGER NOT NULL DEFAULT 24 CHECK (uniqueness_ttl_hours > 0),
    api_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    s2s_postbacks JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_team_idx ON campaigns(team_id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS domain_id BIGINT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS traffic_source_id BIGINT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flow_rotation TEXT NOT NULL DEFAULT 'position' CHECK (flow_rotation IN ('position', 'weight'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_model TEXT NOT NULL DEFAULT 'cpc' CHECK (cost_model IN ('cpc', 'cpm'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_value NUMERIC(12,4) NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_currency CHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_from_param BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS traffic_loss INTEGER NOT NULL DEFAULT 0 CHECK (traffic_loss >= 0 AND traffic_loss <= 100);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS uniqueness TEXT NOT NULL DEFAULT 'ip_ua' CHECK (uniqueness IN ('ip_ua', 'ip', 'parameter'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS use_cookies BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS uniqueness_ttl_hours INTEGER NOT NULL DEFAULT 24 CHECK (uniqueness_ttl_hours > 0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS api_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS s2s_postbacks JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS traffic_sources (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    postback_url TEXT,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS traffic_sources_team_idx ON traffic_sources(team_id);
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS postback_url TEXT;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS countries (
    code CHAR(2) PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO countries (code, name) VALUES
    ('AF', 'Afghanistan'),
    ('AX', 'Åland Islands'),
    ('AL', 'Albania'),
    ('DZ', 'Algeria'),
    ('AS', 'American Samoa'),
    ('AD', 'Andorra'),
    ('AO', 'Angola'),
    ('AI', 'Anguilla'),
    ('AQ', 'Antarctica'),
    ('AG', 'Antigua and Barbuda'),
    ('AR', 'Argentina'),
    ('AM', 'Armenia'),
    ('AW', 'Aruba'),
    ('AU', 'Australia'),
    ('AT', 'Austria'),
    ('AZ', 'Azerbaijan'),
    ('BS', 'Bahamas'),
    ('BH', 'Bahrain'),
    ('BD', 'Bangladesh'),
    ('BB', 'Barbados'),
    ('BY', 'Belarus'),
    ('BE', 'Belgium'),
    ('BZ', 'Belize'),
    ('BJ', 'Benin'),
    ('BM', 'Bermuda'),
    ('BT', 'Bhutan'),
    ('BO', 'Bolivia, Plurinational State of'),
    ('BQ', 'Bonaire, Sint Eustatius and Saba'),
    ('BA', 'Bosnia and Herzegovina'),
    ('BW', 'Botswana'),
    ('BV', 'Bouvet Island'),
    ('BR', 'Brazil'),
    ('IO', 'British Indian Ocean Territory'),
    ('BN', 'Brunei Darussalam'),
    ('BG', 'Bulgaria'),
    ('BF', 'Burkina Faso'),
    ('BI', 'Burundi'),
    ('CV', 'Cabo Verde'),
    ('KH', 'Cambodia'),
    ('CM', 'Cameroon'),
    ('CA', 'Canada'),
    ('KY', 'Cayman Islands'),
    ('CF', 'Central African Republic'),
    ('TD', 'Chad'),
    ('CL', 'Chile'),
    ('CN', 'China'),
    ('CX', 'Christmas Island'),
    ('CC', 'Cocos (Keeling) Islands'),
    ('CO', 'Colombia'),
    ('KM', 'Comoros'),
    ('CG', 'Congo'),
    ('CD', 'Congo, Democratic Republic of the'),
    ('CK', 'Cook Islands'),
    ('CR', 'Costa Rica'),
    ('CI', 'Côte d''Ivoire'),
    ('HR', 'Croatia'),
    ('CU', 'Cuba'),
    ('CW', 'Curaçao'),
    ('CY', 'Cyprus'),
    ('CZ', 'Czechia'),
    ('DK', 'Denmark'),
    ('DJ', 'Djibouti'),
    ('DM', 'Dominica'),
    ('DO', 'Dominican Republic'),
    ('EC', 'Ecuador'),
    ('EG', 'Egypt'),
    ('SV', 'El Salvador'),
    ('GQ', 'Equatorial Guinea'),
    ('ER', 'Eritrea'),
    ('EE', 'Estonia'),
    ('SZ', 'Eswatini'),
    ('ET', 'Ethiopia'),
    ('FK', 'Falkland Islands (Malvinas)'),
    ('FO', 'Faroe Islands'),
    ('FJ', 'Fiji'),
    ('FI', 'Finland'),
    ('FR', 'France'),
    ('GF', 'French Guiana'),
    ('PF', 'French Polynesia'),
    ('TF', 'French Southern Territories'),
    ('GA', 'Gabon'),
    ('GM', 'Gambia'),
    ('GE', 'Georgia'),
    ('DE', 'Germany'),
    ('GH', 'Ghana'),
    ('GI', 'Gibraltar'),
    ('GR', 'Greece'),
    ('GL', 'Greenland'),
    ('GD', 'Grenada'),
    ('GP', 'Guadeloupe'),
    ('GU', 'Guam'),
    ('GT', 'Guatemala'),
    ('GG', 'Guernsey'),
    ('GN', 'Guinea'),
    ('GW', 'Guinea-Bissau'),
    ('GY', 'Guyana'),
    ('HT', 'Haiti'),
    ('HM', 'Heard Island and McDonald Islands'),
    ('VA', 'Holy See'),
    ('HN', 'Honduras'),
    ('HK', 'Hong Kong'),
    ('HU', 'Hungary'),
    ('IS', 'Iceland'),
    ('IN', 'India'),
    ('ID', 'Indonesia'),
    ('IR', 'Iran, Islamic Republic of'),
    ('IQ', 'Iraq'),
    ('IE', 'Ireland'),
    ('IM', 'Isle of Man'),
    ('IL', 'Israel'),
    ('IT', 'Italy'),
    ('JM', 'Jamaica'),
    ('JP', 'Japan'),
    ('JE', 'Jersey'),
    ('JO', 'Jordan'),
    ('KZ', 'Kazakhstan'),
    ('KE', 'Kenya'),
    ('KI', 'Kiribati'),
    ('KP', 'Korea, Democratic People''s Republic of'),
    ('KR', 'Korea, Republic of'),
    ('KW', 'Kuwait'),
    ('KG', 'Kyrgyzstan'),
    ('LA', 'Lao People''s Democratic Republic'),
    ('LV', 'Latvia'),
    ('LB', 'Lebanon'),
    ('LS', 'Lesotho'),
    ('LR', 'Liberia'),
    ('LY', 'Libya'),
    ('LI', 'Liechtenstein'),
    ('LT', 'Lithuania'),
    ('LU', 'Luxembourg'),
    ('MO', 'Macao'),
    ('MG', 'Madagascar'),
    ('MW', 'Malawi'),
    ('MY', 'Malaysia'),
    ('MV', 'Maldives'),
    ('ML', 'Mali'),
    ('MT', 'Malta'),
    ('MH', 'Marshall Islands'),
    ('MQ', 'Martinique'),
    ('MR', 'Mauritania'),
    ('MU', 'Mauritius'),
    ('YT', 'Mayotte'),
    ('MX', 'Mexico'),
    ('FM', 'Micronesia, Federated States of'),
    ('MD', 'Moldova, Republic of'),
    ('MC', 'Monaco'),
    ('MN', 'Mongolia'),
    ('ME', 'Montenegro'),
    ('MS', 'Montserrat'),
    ('MA', 'Morocco'),
    ('MZ', 'Mozambique'),
    ('MM', 'Myanmar'),
    ('NA', 'Namibia'),
    ('NR', 'Nauru'),
    ('NP', 'Nepal'),
    ('NL', 'Netherlands, Kingdom of the'),
    ('NC', 'New Caledonia'),
    ('NZ', 'New Zealand'),
    ('NI', 'Nicaragua'),
    ('NE', 'Niger'),
    ('NG', 'Nigeria'),
    ('NU', 'Niue'),
    ('NF', 'Norfolk Island'),
    ('MK', 'North Macedonia'),
    ('MP', 'Northern Mariana Islands'),
    ('NO', 'Norway'),
    ('OM', 'Oman'),
    ('PK', 'Pakistan'),
    ('PW', 'Palau'),
    ('PS', 'Palestine, State of'),
    ('PA', 'Panama'),
    ('PG', 'Papua New Guinea'),
    ('PY', 'Paraguay'),
    ('PE', 'Peru'),
    ('PH', 'Philippines'),
    ('PN', 'Pitcairn'),
    ('PL', 'Poland'),
    ('PT', 'Portugal'),
    ('PR', 'Puerto Rico'),
    ('QA', 'Qatar'),
    ('RE', 'Réunion'),
    ('RO', 'Romania'),
    ('RU', 'Russian Federation'),
    ('RW', 'Rwanda'),
    ('BL', 'Saint Barthélemy'),
    ('SH', 'Saint Helena, Ascension and Tristan da Cunha'),
    ('KN', 'Saint Kitts and Nevis'),
    ('LC', 'Saint Lucia'),
    ('MF', 'Saint Martin (French part)'),
    ('PM', 'Saint Pierre and Miquelon'),
    ('VC', 'Saint Vincent and the Grenadines'),
    ('WS', 'Samoa'),
    ('SM', 'San Marino'),
    ('ST', 'Sao Tome and Principe'),
    ('SA', 'Saudi Arabia'),
    ('SN', 'Senegal'),
    ('RS', 'Serbia'),
    ('SC', 'Seychelles'),
    ('SL', 'Sierra Leone'),
    ('SG', 'Singapore'),
    ('SX', 'Sint Maarten (Dutch part)'),
    ('SK', 'Slovakia'),
    ('SI', 'Slovenia'),
    ('SB', 'Solomon Islands'),
    ('SO', 'Somalia'),
    ('ZA', 'South Africa'),
    ('GS', 'South Georgia and the South Sandwich Islands'),
    ('SS', 'South Sudan'),
    ('ES', 'Spain'),
    ('LK', 'Sri Lanka'),
    ('SD', 'Sudan'),
    ('SR', 'Suriname'),
    ('SJ', 'Svalbard and Jan Mayen'),
    ('SE', 'Sweden'),
    ('CH', 'Switzerland'),
    ('SY', 'Syrian Arab Republic'),
    ('TW', 'Taiwan, Province of China'),
    ('TJ', 'Tajikistan'),
    ('TZ', 'Tanzania, United Republic of'),
    ('TH', 'Thailand'),
    ('TL', 'Timor-Leste'),
    ('TG', 'Togo'),
    ('TK', 'Tokelau'),
    ('TO', 'Tonga'),
    ('TT', 'Trinidad and Tobago'),
    ('TN', 'Tunisia'),
    ('TR', 'Türkiye'),
    ('TM', 'Turkmenistan'),
    ('TC', 'Turks and Caicos Islands'),
    ('TV', 'Tuvalu'),
    ('UG', 'Uganda'),
    ('UA', 'Ukraine'),
    ('AE', 'United Arab Emirates'),
    ('GB', 'United Kingdom of Great Britain and Northern Ireland'),
    ('US', 'United States of America'),
    ('UM', 'United States Minor Outlying Islands'),
    ('UY', 'Uruguay'),
    ('UZ', 'Uzbekistan'),
    ('VU', 'Vanuatu'),
    ('VE', 'Venezuela, Bolivarian Republic of'),
    ('VN', 'Viet Nam'),
    ('VG', 'Virgin Islands (British)'),
    ('VI', 'Virgin Islands (U.S.)'),
    ('WF', 'Wallis and Futuna'),
    ('EH', 'Western Sahara'),
    ('YE', 'Yemen'),
    ('ZM', 'Zambia'),
    ('ZW', 'Zimbabwe')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

CREATE TABLE IF NOT EXISTS offers (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    group_name TEXT,
    affiliate_network TEXT,
    country TEXT,
    offer_type TEXT NOT NULL DEFAULT 'redirect' CHECK (offer_type IN ('local', 'redirect', 'preload', 'action')),
    local_path TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    payout_type TEXT NOT NULL DEFAULT 'cpa' CHECK (payout_type IN ('cpa', 'cpc')),
    payout NUMERIC(12,4) NOT NULL DEFAULT 0,
    payout_currency CHAR(3) NOT NULL DEFAULT 'EUR',
    payout_from_param BOOLEAN NOT NULL DEFAULT true,
    conversion_cap_enabled BOOLEAN NOT NULL DEFAULT false,
    daily_conversion_cap INTEGER NOT NULL DEFAULT 0 CHECK (daily_conversion_cap >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_team_idx ON offers(team_id);
ALTER TABLE offers ALTER COLUMN url SET DEFAULT '';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS affiliate_network TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS offer_type TEXT NOT NULL DEFAULT 'redirect' CHECK (offer_type IN ('local', 'redirect', 'preload', 'action'));
ALTER TABLE offers ADD COLUMN IF NOT EXISTS local_path TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS payout_type TEXT NOT NULL DEFAULT 'cpa' CHECK (payout_type IN ('cpa', 'cpc'));
ALTER TABLE offers ADD COLUMN IF NOT EXISTS payout_currency CHAR(3) NOT NULL DEFAULT 'EUR';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS payout_from_param BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS conversion_cap_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS daily_conversion_cap INTEGER NOT NULL DEFAULT 0 CHECK (daily_conversion_cap >= 0);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS offers_team_local_path_idx ON offers(team_id, local_path) WHERE local_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS landings (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    group_name TEXT,
    landing_type TEXT NOT NULL DEFAULT 'local' CHECK (landing_type IN ('local')),
    local_path TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landings_team_idx ON landings(team_id);
ALTER TABLE landings ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE landings ADD COLUMN IF NOT EXISTS landing_type TEXT NOT NULL DEFAULT 'local' CHECK (landing_type IN ('local'));
ALTER TABLE landings ADD COLUMN IF NOT EXISTS local_path TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS landings_team_local_path_idx ON landings(team_id, local_path) WHERE local_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS domains (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    domain TEXT NOT NULL UNIQUE,
    group_name TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_dns' CHECK (status IN ('ok', 'awaiting_dns', 'disabled')),
    allow_indexing BOOLEAN NOT NULL DEFAULT false,
    allow_admin_access BOOLEAN NOT NULL DEFAULT false,
    https_only BOOLEAN NOT NULL DEFAULT true,
    index_campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS domains_team_idx ON domains(team_id);
CREATE INDEX IF NOT EXISTS domains_domain_idx ON domains(domain);
ALTER TABLE domains ALTER COLUMN status SET DEFAULT 'awaiting_dns';

CREATE TABLE IF NOT EXISTS flows (
    id BIGSERIAL PRIMARY KEY,
    campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    flow_type TEXT NOT NULL DEFAULT 'regular' CHECK (flow_type IN ('regular', 'default', 'forced')),
    position INTEGER NOT NULL DEFAULT 0,
    collect_clicks BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE flows ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'regular' CHECK (flow_type IN ('regular', 'default', 'forced'));
ALTER TABLE flows ADD COLUMN IF NOT EXISTS collect_clicks BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS flow_filters (
    id BIGSERIAL PRIMARY KEY,
    flow_id BIGINT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    operator TEXT NOT NULL DEFAULT 'in' CHECK (operator IN ('in', 'not_in', 'equals', 'not_equals')),
    values JSONB NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE flow_filters DROP CONSTRAINT IF EXISTS flow_filters_type_check;

CREATE TABLE IF NOT EXISTS streams (
    id BIGSERIAL PRIMARY KEY,
    flow_id BIGINT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_destinations (
    id BIGSERIAL PRIMARY KEY,
    stream_id BIGINT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    destination_type TEXT NOT NULL CHECK (destination_type IN ('offer', 'landing', 'url')),
    destination_id BIGINT,
    url TEXT,
    weight INTEGER NOT NULL DEFAULT 100 CHECK (weight > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversions (
    id BIGSERIAL PRIMARY KEY,
    click_id TEXT NOT NULL,
    transaction_id TEXT,
    goal TEXT NOT NULL DEFAULT 'sale',
    payout NUMERIC(12,4) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'accepted',
    event_key TEXT NOT NULL UNIQUE,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversions_click_id_idx ON conversions(click_id);
