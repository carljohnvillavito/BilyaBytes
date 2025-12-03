# 🚀 Deploying BilyaBits to Vercel

## ⚠️ Important: Database Issue

Your app currently uses `db.json` as a database, which **will not work on Vercel** because:
- Vercel is serverless (functions restart and lose local data)
- File system is read-only in production

## 📋 Option 1: Quick Deploy (Files expire after ~5 minutes)

Since your app already has expiry logic, you can deploy as-is for testing, but files will only persist while the serverless function is warm (~5 minutes).

### Steps:

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Set Environment Variables**
   
   After first deployment, go to your Vercel dashboard:
   - Go to your project → Settings → Environment Variables
   - Add these variables:
     ```
     CLOUDINARY_CLOUD_NAME=dxxzld6kr
     CLOUDINARY_API_KEY=312899939182774
     CLOUDINARY_API_SECRET=BWhQ8L4Wt_LJuX3L3HPoEO8WuS4
     ```

5. **Redeploy with Environment Variables**
   ```bash
   vercel --prod
   ```

## 📋 Option 2: Production Ready (Recommended)

For a production app, replace `db.json` with a real database:

### A. Use Vercel Postgres (Free tier available)

1. Go to Vercel Dashboard → Storage → Create Database → Postgres
2. Connect it to your project
3. Update `src/db.js` to use Postgres instead of JSON file

### B. Use Vercel KV (Redis)

1. Go to Vercel Dashboard → Storage → Create Database → KV
2. Connect it to your project
3. Update `src/db.js` to use KV storage

### C. Use MongoDB Atlas (Free tier)

1. Create a free MongoDB cluster at mongodb.com/atlas
2. Get connection string
3. Add to Vercel environment variables
4. Update `src/db.js` to use MongoDB

## 🔧 Current Limitations with db.json on Vercel:

- ❌ Bundle data lost when serverless function goes cold
- ❌ Can't persist upload history
- ❌ Cleanup tasks won't work reliably
- ✅ Cloudinary files are safe (stored in cloud)

## ✅ What Works Fine:

- File uploads to Cloudinary
- File downloads from Cloudinary
- Frontend (HTML/CSS/JS)
- API endpoints

## 🎯 Recommended Next Steps:

1. **Test deployment** with current setup (works for short-lived links)
2. **Choose a database** from Option 2 for production
3. **Update db.js** to use chosen database
4. **Redeploy** to Vercel

## 📝 Deployment Command Summary:

```bash
# First time
vercel

# Production deployment
vercel --prod

# Check logs
vercel logs

# List deployments
vercel ls
```

## 🌐 After Deployment:

Your app will be available at:
- `https://your-project-name.vercel.app`
- You can add a custom domain in Vercel dashboard

---

**Note:** I've created `vercel.json` and `.vercelignore` files in your project. These configure Vercel to deploy your Node.js app correctly.
