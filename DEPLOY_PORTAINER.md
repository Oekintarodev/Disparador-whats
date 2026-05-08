# Deploy no Portainer (Docker Compose, sem Swarm)

## 1) Pré-requisitos
- Portainer com acesso ao Docker Engine (modo normal, não Swarm).
- Repositório acessível pelo Portainer.
- Portas livres no host:
  - `8090` (frontend)
  - `3001` (backend, opcional para debug/API direta)

## 2) Arquivos usados
- `docker-compose.portainer.yml`
- `.env.portainer.example` (copie para `.env` no Portainer ou preencha no formulário de variáveis)

## 3) Criar stack no Portainer
1. Acesse `Stacks` > `Add stack`.
2. Nome: `disparador-whats`.
3. Método:
   - `Repository` (recomendado): informe este repositório e branch `main`.
   - ou `Upload` do `docker-compose.portainer.yml`.
4. Em `Environment variables`, preencha no mínimo:
   - `POSTGRES_PASSWORD`
   - `JWT_SECRET`
   - `APP_URL`
   - `ALLOWED_ORIGINS`
5. Deploy da stack.

## 4) Pós-deploy
- URL frontend: `http://72.61.46.172:8090`
- API healthcheck: `http://72.61.46.172:3001/api/health`

## 5) Usuário padrão (seed)
- `superadmin@astraonline.com.br`
- `Admin123`

- `admin@astraonline.com.br`
- `Admin123`

## 6) Observações
- O backend cria schema/seed automaticamente no startup.
- Volumes persistentes usados:
  - `postgres_data`
  - `redis_data`
  - `contacts_data`
  - `uploads_data`
  - `backup_data`
