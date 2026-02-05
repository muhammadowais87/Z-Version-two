# AWS Deployment Guide for HyperliquidWhale

## Overview

This guide covers migrating HyperliquidWhale from Lovable Cloud to AWS infrastructure.

---

## Architecture Options

### Option 1: Hybrid (Recommended)
- **Frontend**: AWS (S3 + CloudFront)
- **Backend**: Keep on Lovable Cloud (Supabase)
- **Pros**: Easiest migration, keeps database intact
- **Cons**: Split infrastructure

### Option 2: Full AWS Migration
- **Frontend**: AWS S3 + CloudFront
- **Backend**: AWS RDS (PostgreSQL) + Lambda
- **Auth**: AWS Cognito or self-hosted
- **Pros**: Full control, single provider
- **Cons**: Complex migration, requires rewriting edge functions

---

## Option 1: Frontend on AWS (Hybrid)

### Step 1: Build the Frontend

```bash
# Clone your repository
git clone <your-repo-url>
cd <project-folder>

# Install dependencies
npm install

# Build for production
npm run build
```

This creates a `dist/` folder with static files.

### Step 2: Create S3 Bucket

1. Go to AWS Console → S3
2. Create bucket: `hyperliquidwhale-frontend`
3. Uncheck "Block all public access"
4. Enable static website hosting:
   - Index document: `index.html`
   - Error document: `index.html` (for SPA routing)

### Step 3: Upload Build Files

```bash
# Using AWS CLI
aws s3 sync dist/ s3://hyperliquidwhale-frontend --delete
```

### Step 4: Create CloudFront Distribution

1. Go to AWS Console → CloudFront
2. Create distribution:
   - Origin: Your S3 bucket
   - Viewer Protocol Policy: Redirect HTTP to HTTPS
   - Default Root Object: `index.html`
3. Add custom error response:
   - Error code: 403, 404
   - Response page: `/index.html`
   - Response code: 200

### Step 5: Configure Custom Domain (Optional)

1. Request SSL certificate in AWS Certificate Manager
2. Add alternate domain name in CloudFront
3. Update DNS records to point to CloudFront

### Step 6: Environment Variables

Create `.env.production`:

```env
VITE_SUPABASE_URL=https://lqfbpdbcmhaovcuufwxp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=lqfbpdbcmhaovcuufwxp
```

---

## Option 2: Full AWS Migration

### AWS Services Required

| Component | AWS Service | Purpose |
|-----------|-------------|---------|
| Frontend | S3 + CloudFront | Static hosting + CDN |
| Database | RDS PostgreSQL | Data storage |
| Backend Functions | Lambda | Edge function replacement |
| API Gateway | API Gateway | Route Lambda functions |
| Authentication | Cognito | User auth (or custom) |
| Secrets | Secrets Manager | Store API keys |
| Monitoring | CloudWatch | Logs and metrics |

### Step 1: Database Migration

#### Create RDS PostgreSQL Instance

1. Go to AWS Console → RDS
2. Create database:
   - Engine: PostgreSQL 15+
   - Instance class: db.t3.micro (dev) or db.t3.small (prod)
   - Storage: 20 GB (auto-scaling)
   - Enable Multi-AZ for production

#### Export Supabase Data

```sql
-- Export from Supabase (use their dashboard or pg_dump)
pg_dump -h db.lqfbpdbcmhaovcuufwxp.supabase.co \
  -U postgres \
  -d postgres \
  -F c \
  -f backup.dump
```

#### Import to RDS

```bash
pg_restore -h your-rds-endpoint.rds.amazonaws.com \
  -U postgres \
  -d postgres \
  backup.dump
```

### Step 2: Convert Edge Functions to Lambda

#### Example: telegram-auth Lambda

```javascript
// lambda/telegram-auth/index.js
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body);
    const { initData, referralCode } = body;

    // Validate Telegram data
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    // ... validation logic

    // Connect to RDS
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // ... authentication logic

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

### Step 3: API Gateway Setup

1. Create REST API in API Gateway
2. Create resources for each endpoint:
   - `/telegram-auth` → POST
   - `/start-cycle` → POST
   - `/withdraw-cycle` → POST
   - `/get-cycle-info` → GET
   - `/get-cycle-history` → GET
   - `/admin-get-all-cycles` → GET
   - `/admin-complete-cycle` → POST
   - `/admin-manage-penalty` → POST
   - `/complete-trade-cycles` → POST (scheduled)
   - `/send-otp-email` → POST
   - `/verify-otp` → POST
   - `/complete-investments` → POST

3. Connect each resource to corresponding Lambda
4. Deploy API to stage (prod/dev)

### Step 4: Scheduled Tasks (Cron Jobs)

Replace Supabase cron with EventBridge:

1. Go to AWS Console → EventBridge
2. Create rule:
   - Name: `complete-trade-cycles`
   - Schedule: `rate(1 hour)`
   - Target: Lambda function `complete-trade-cycles`

### Step 5: Secrets Management

1. Go to AWS Console → Secrets Manager
2. Store secrets:
   ```json
   {
     "TELEGRAM_BOT_TOKEN": "your-token",
     "DATABASE_URL": "postgresql://...",
     "CRON_SECRET": "your-secret",
     "RESEND_API_KEY": "your-key"
   }
   ```

3. Access in Lambda:
   ```javascript
   const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

   const client = new SecretsManagerClient({ region: 'us-east-1' });
   const response = await client.send(
     new GetSecretValueCommand({ SecretId: 'hyperliquidwhale-secrets' })
   );
   const secrets = JSON.parse(response.SecretString);
   ```

---

## Infrastructure as Code (Terraform)

### Main Configuration

```hcl
# main.tf
provider "aws" {
  region = "us-east-1"
}

# S3 Bucket for Frontend
resource "aws_s3_bucket" "frontend" {
  bucket = "hyperliquidwhale-frontend"
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.frontend.id}"
  }

  enabled             = true
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.frontend.id}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier           = "hyperliquidwhale-db"
  engine               = "postgres"
  engine_version       = "15"
  instance_class       = "db.t3.micro"
  allocated_storage    = 20
  storage_encrypted    = true
  
  db_name  = "hyperliquidwhale"
  username = "postgres"
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  skip_final_snapshot    = true
}
```

---

## Cost Estimation

### Hybrid Approach (Frontend on AWS)

| Service | Monthly Cost |
|---------|--------------|
| S3 (storage) | ~$1 |
| CloudFront (CDN) | ~$5-20 |
| **Total** | ~$6-21/month |

### Full AWS Migration

| Service | Monthly Cost |
|---------|--------------|
| S3 + CloudFront | ~$6-21 |
| RDS db.t3.micro | ~$15 |
| RDS db.t3.small | ~$30 |
| Lambda (1M requests) | ~$0.20 |
| API Gateway | ~$3.50 |
| Secrets Manager | ~$0.40 |
| CloudWatch | ~$3 |
| **Total (micro)** | ~$28-43/month |
| **Total (small)** | ~$43-58/month |

---

## CI/CD Pipeline

### GitHub Actions for AWS Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}
          
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy to S3
        run: aws s3 sync dist/ s3://hyperliquidwhale-frontend --delete
        
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

---

## Migration Checklist

### Pre-Migration
- [ ] Export database backup from Supabase
- [ ] Document all environment variables
- [ ] List all edge functions and their dependencies
- [ ] Test build locally

### Frontend Migration
- [ ] Create S3 bucket
- [ ] Configure static website hosting
- [ ] Create CloudFront distribution
- [ ] Upload build files
- [ ] Test all routes work

### Backend Migration (if full migration)
- [ ] Create RDS instance
- [ ] Import database
- [ ] Recreate all database functions
- [ ] Convert edge functions to Lambda
- [ ] Setup API Gateway
- [ ] Configure EventBridge for cron jobs
- [ ] Store secrets in Secrets Manager
- [ ] Update frontend API endpoints

### Post-Migration
- [ ] Test authentication flow
- [ ] Test all trading cycles
- [ ] Test admin functions
- [ ] Test withdrawals
- [ ] Monitor CloudWatch logs
- [ ] Setup alerts

---

## Important Notes

1. **Database Functions**: All PostgreSQL functions (RLS policies, triggers, stored procedures) must be recreated in RDS
2. **Telegram Bot**: Update webhook URL if using full migration
3. **CORS**: Update allowed origins in Lambda functions
4. **Cron Jobs**: EventBridge replaces Supabase pg_cron

---

## Recommendation

For your use case, I recommend **Option 1 (Hybrid)**:
- Keep backend on Lovable Cloud (Supabase) - stable, tested, works
- Deploy frontend to AWS S3 + CloudFront
- Lower complexity, faster migration
- Easy rollback if issues arise

Full migration to AWS is possible but requires significant effort to rewrite edge functions and recreate database structure.
