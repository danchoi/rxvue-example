require 'sinatra'
require 'json'

puts "Open your browser http://localhost:4567/index.html"

set :public_dir, '.'
get '/ticker_search' do
  query = params[:prefix] || ''
  [['ACLU', 'American Civil Liberties'],['NRA', 'National Rifle Association']].select {|x| x[0].include?(query.upcase)}.to_json
end


