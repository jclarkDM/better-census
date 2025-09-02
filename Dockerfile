FROM oven/bun:latest AS curl-base
WORKDIR /data

# Curl & Unzip
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

# Download Data
FROM curl-base AS age-data
RUN curl -L -o age.zip https://github.com/jclarkDM/better-census/releases/download/data/age.zip
RUN unzip age.zip -d . && rm age.zip

FROM curl-base AS hispanic-data
RUN curl -L -o hispanic_origin.zip https://github.com/jclarkDM/better-census/releases/download/data/hispanic_origin.zip
RUN unzip hispanic_origin.zip -d . && rm hispanic_origin.zip

FROM curl-base AS household-income-data
RUN curl -L -o household_income.zip https://github.com/jclarkDM/better-census/releases/download/data/household_income.zip
RUN unzip household_income.zip -d . && rm household_income.zip

FROM curl-base AS per-capita-income-data
RUN curl -L -o per_capita_income.zip https://github.com/jclarkDM/better-census/releases/download/data/per_capita_income.zip
RUN unzip per_capita_income.zip -d . && rm per_capita_income.zip

FROM curl-base AS earnings-data
RUN curl -L -o earnings.zip https://github.com/jclarkDM/better-census/releases/download/data/earnings.zip
RUN unzip earnings.zip -d . && rm earnings.zip

FROM curl-base AS geoid-data
RUN curl -L -o cb_2024_us_place_500k.zip https://github.com/jclarkDM/better-census/releases/download/data/cb_2024_us_place_500k.zip
RUN unzip cb_2024_us_place_500k.zip -d . && rm cb_2024_us_place_500k.zip
RUN curl -L -o cb_2024_us_cousub_500k.zip https://github.com/jclarkDM/better-census/releases/download/data/cb_2024_us_cousub_500k.zip
RUN unzip cb_2024_us_cousub_500k.zip -d . && rm cb_2024_us_cousub_500k.zip

#

FROM oven/bun:latest
WORKDIR /app

# Transfer App
COPY package.json bun.lock ./
RUN bun i
COPY . .

# Copy Data to App
COPY --from=age-data /data ./data/raw/
COPY --from=hispanic-data /data ./data/raw/
COPY --from=household-income-data /data ./data/raw/
COPY --from=per-capita-income-data /data ./data/raw/
COPY --from=earnings-data /data ./data/raw/
COPY --from=geoid-data /data ./data/boundaries/

# Start Server
CMD ["sh", "-c", "bun etl --geoid '^(060|160)0000US' && bun run server"]