from django.shortcuts import render
from django.shortcuts import get_object_or_404, redirect
from django.http import HttpResponse
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from .models import Post
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.db.models import Count
from django import forms
from .api import get_blocked_user_ids

# Create your views here.



def home(request):
    context = {
        "posts": Post.objects.all()
    }
    return render (request, 'blog/home.html', context)



class PostListView(ListView):
    model = Post
    template_name = 'blog/home.html'
    context_object_name = 'posts'
    ordering = ['-date_posted']
    paginate_by = 6

    def get_queryset(self):
        base_qs = super().get_queryset()
        qs = (
            base_qs
            .select_related('author', 'author__profile')
            .prefetch_related('likes', 'dislikes')
            .annotate(
                likes_count=Count('likes', distinct=True),
                dislikes_count=Count('dislikes', distinct=True),
            )
        )
        blocked_ids = get_blocked_user_ids(self.request.user)
        if blocked_ids:
            qs = qs.exclude(author_id__in=blocked_ids)
        return qs
    

class PostDetailView(DetailView):
    model = Post

    def get_queryset(self):
        qs = (
            super().get_queryset()
            .select_related('author', 'author__profile')
            .prefetch_related('likes', 'dislikes')
            .annotate(
                likes_count=Count('likes', distinct=True),
                dislikes_count=Count('dislikes', distinct=True),
            )
        )
        blocked_ids = get_blocked_user_ids(self.request.user)
        if blocked_ids:
            qs = qs.exclude(author_id__in=blocked_ids)
        return qs
   
    

class PostCreateView(LoginRequiredMixin, CreateView):
    model = Post
    fields = ['title', 'content', 'post_image']



    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form)
    

class PostUpdateView(LoginRequiredMixin, UserPassesTestMixin, UpdateView):
    model = Post
    fields = ['title', 'content']

    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form) 

    def test_func(self):
        post = self.get_object()
        if self.request.user == post.author:
            return True
        return False
    

class PostDeleteView(LoginRequiredMixin, UserPassesTestMixin, DeleteView,):
    model = Post
    success_url = '/'

    def test_func(self):
        post = self.get_object()
        if self.request.user == post.author:
            return True
        return False

def about(request):
    return render(request, 'blog/about.html', {'title': 'About'})