FROM node:18-slim

WORKDIR /app

COPY package*.json ./
COPY app.js ./
COPY equipment_rental.js ./
COPY entrypoint.sh ./  

RUN npm install

COPY . .

RUN chmod +x ./entrypoint.sh # <<< 2. ADD THIS to make the entrypoint script executable

ENTRYPOINT ["./entrypoint.sh"]

CMD ["--recordId", "defaultRecordId", "--projectId", "defaultProjectId"]